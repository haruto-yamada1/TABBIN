import type { SavedTabsSearchHistoryPort } from '@/contexts/saved-tabs/application/ports/SavedTabsSearchHistoryPort'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageLocal,
  getChromeStorageOnChanged,
} from '@/lib/browser/chrome-storage'

const KEY = 'savedTabsSearchHistory'
const LIMIT = 50
const MAX_LENGTH = 2048
const LOCK = 'tabbin:saved-tabs-search-history:v1'
const HISTORY_DELAY_MS = 1200
const DELETE_WAIT_MS = 5000

type Storage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (value: Record<string, unknown>) => Promise<void>
}

type Changes = {
  addListener: (listener: ChromeOnChangedListener) => void
  removeListener: (listener: ChromeOnChangedListener) => void
}

type Deps = {
  storage?: Storage
  changes?: Changes
  runExclusive?: <T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>
  runForQuery?: <T>(
    query: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ) => Promise<T>
}

const isLockManager = (value: unknown): value is LockManager =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'request') === 'function'

const withLock = async <T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const nav: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown =
    typeof nav === 'object' && nav !== null
      ? Reflect.get(nav, 'locks')
      : undefined
  if (!isLockManager(locks)) {
    throw new Error('Search history coordination is unavailable')
  }
  return locks.request(
    LOCK,
    { mode: 'exclusive', ...(signal ? { signal } : {}) },
    operation,
  )
}

const withQueryLock = async <T>(
  query: string,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> => {
  const nav: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown =
    typeof nav === 'object' && nav !== null
      ? Reflect.get(nav, 'locks')
      : undefined
  if (!isLockManager(locks)) {
    throw new Error('Search history coordination is unavailable')
  }
  return locks.request(
    `${LOCK}:query:${query}`,
    { mode: 'exclusive', ...(signal ? { signal } : {}) },
    operation,
  )
}

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new DOMException('Search history operation cancelled', 'AbortError')
  }
}

const abortableRead = async <T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) {
    return operation
  }
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      reject(
        new DOMException('Search history operation cancelled', 'AbortError'),
      )
    }
    signal.addEventListener('abort', cancel, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel)
        reject(
          error instanceof Error
            ? error
            : new Error('Search history read failed'),
        )
      },
    )
  })
}

const waitForSearch = async (signal: AbortSignal): Promise<void> => {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(
        new DOMException('Search history operation cancelled', 'AbortError'),
      )
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, HISTORY_DELAY_MS)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

const isHistory = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every(
    (entry: unknown): entry is string =>
      typeof entry === 'string' &&
      entry.length > 0 &&
      entry.length <= MAX_LENGTH &&
      entry.trim() === entry,
  )

const parse = (value: unknown): string[] => {
  if (value === undefined) {
    return []
  }
  if (
    !isHistory(value) ||
    value.length > LIMIT ||
    new Set(value).size !== value.length
  ) {
    throw new Error('Stored search history is invalid')
  }
  return value
}

export const createChromeSavedTabsSearchHistory = (
  deps: Deps = {},
): SavedTabsSearchHistoryPort => {
  const storage = (): Storage => {
    const value = deps.storage ?? getChromeStorageLocal()
    if (!value) {
      throw new Error('Search history storage is unavailable')
    }
    return value
  }
  const read = async (signal?: AbortSignal): Promise<string[]> =>
    parse((await abortableRead(storage().get(KEY), signal))[KEY])
  const mutate = async (
    change: (entries: string[]) => string[],
    signal?: AbortSignal,
  ): Promise<string[]> =>
    (deps.runExclusive ?? withLock)(async () => {
      throwIfAborted(signal)
      const previous = await read(signal)
      throwIfAborted(signal)
      const next = parse(change(previous))
      if (JSON.stringify(next) !== JSON.stringify(previous)) {
        await storage().set({ [KEY]: next })
      }
      return next
    }, signal)
  const runForQuery = deps.runForQuery ?? withQueryLock
  const record = async (
    query: string,
    signal?: AbortSignal,
    delayed = false,
  ): Promise<string[]> => {
    const value = query.trim()
    if (value.length > MAX_LENGTH) {
      throw new Error('Search history entry is too long')
    }
    if (!value) {
      return read()
    }
    return runForQuery(value, signal, async () => {
      if (delayed && signal) {
        await waitForSearch(signal)
      }
      return mutate(
        (entries) =>
          [value, ...entries.filter((entry) => entry !== value)].slice(
            0,
            LIMIT,
          ),
        signal,
      )
    })
  }
  return {
    read: async () => read(),
    record: async (query) => record(query),
    schedule: async (query, signal) => record(query, signal, true),
    remove: async (query) => {
      const value = query.trim()
      const signal = AbortSignal.timeout(DELETE_WAIT_MS)
      return runForQuery(value, signal, async () =>
        mutate((entries) => entries.filter((entry) => entry !== value), signal),
      )
    },
    subscribe: (listener) => {
      const changes = deps.changes ?? getChromeStorageOnChanged()
      if (!changes) {
        throw new Error('Search history events are unavailable')
      }
      const onChanged: ChromeOnChangedListener = (changed, area) => {
        if (area === 'local' && Object.hasOwn(changed, KEY)) {
          let removed: string[] = []
          try {
            const before = parse(changed[KEY]?.oldValue)
            const after = parse(changed[KEY]?.newValue)
            const beforeEntries = new Set(before)
            const afterEntries = new Set(after)
            const capacityEviction =
              before.length === LIMIT &&
              after.length === LIMIT &&
              after.some((entry) => !beforeEntries.has(entry))
            removed = capacityEviction
              ? []
              : before.filter((entry) => !afterEntries.has(entry))
          } catch {
            // The subsequent read reports malformed storage without overwriting it.
          }
          listener(removed)
        }
      }
      changes.addListener(onChanged)
      return () => {
        changes.removeListener(onChanged)
      }
    },
  }
}

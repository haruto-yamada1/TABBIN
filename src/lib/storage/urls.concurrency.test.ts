/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UrlRecord } from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0

  return {
    resetUuid: () => {
      uuidIndex = 0
      mocks.uuid.mockClear()
    },
    uuid: vi.fn(() => `uuid-${++uuidIndex}`),
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

type SharedUrlState = {
  urls: UrlRecord[]
}

type StorageOperation = {
  call: number
  records: UrlRecord[]
}

type SharedUrlStorageHooks = {
  afterReadSnapshot?: (operation: StorageOperation) => Promise<void> | void
  beforeWriteCommit?: (operation: StorageOperation) => Promise<void> | void
  afterWriteCommit?: (operation: StorageOperation) => Promise<void> | void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  }
}

const cloneRecords = (records: UrlRecord[]): UrlRecord[] =>
  structuredClone(records)

const createSharedUrlStorage = (
  state: SharedUrlState,
  hooks: SharedUrlStorageHooks = {},
) => {
  const reads: StorageOperation[] = []
  const writes: StorageOperation[] = []
  const commits: StorageOperation[] = []

  return {
    commits,
    local: {
      get: vi.fn(async () => {
        const operation = {
          call: reads.length + 1,
          records: cloneRecords(state.urls),
        }
        reads.push(operation)
        await hooks.afterReadSnapshot?.(operation)
        return { urls: cloneRecords(operation.records) }
      }),
      set: vi.fn(async (value: Record<string, unknown>) => {
        if (!Array.isArray(value.urls)) {
          throw new TypeError('urls write must contain an array')
        }
        const operation = {
          call: writes.length + 1,
          records: cloneRecords(value.urls as UrlRecord[]),
        }
        writes.push(operation)
        await hooks.beforeWriteCommit?.(operation)
        state.urls = cloneRecords(operation.records)
        commits.push(operation)
        await hooks.afterWriteCommit?.(operation)
      }),
    } as unknown as typeof chrome.storage.local,
    reads,
    writes,
  }
}

const installChromeStorage = (local: typeof chrome.storage.local) => {
  const listeners = new Set<
    Parameters<typeof chrome.storage.onChanged.addListener>[0]
  >()
  const onChanged = {
    addListener: vi.fn((listener) => listeners.add(listener)),
    hasListener: vi.fn((listener) => listeners.has(listener)),
    hasListeners: vi.fn(() => listeners.size > 0),
    removeListener: vi.fn((listener) => listeners.delete(listener)),
  } as unknown as typeof chrome.storage.onChanged

  globalThis.chrome = {
    storage: {
      local,
      onChanged,
    },
  } as unknown as typeof chrome
}

const loadFreshUrlsModule = async () => {
  vi.resetModules()
  return import('./urls')
}

describe('URL storage concurrency boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.resetUuid()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('one module queue serializes two URL mutations', async () => {
    const state: SharedUrlState = { urls: [] }
    const firstWriteStarted = createDeferred<undefined>()
    const allowFirstWriteCommit = createDeferred<undefined>()
    const operationOrder: string[] = []
    const storage = createSharedUrlStorage(state, {
      afterReadSnapshot: ({ call }) => {
        operationOrder.push(`get:${call}`)
      },
      beforeWriteCommit: async ({ call }) => {
        operationOrder.push(`set:start:${call}`)
        if (call === 1) {
          firstWriteStarted.resolve(undefined)
          await allowFirstWriteCommit.promise
        }
      },
      afterWriteCommit: ({ call }) => {
        operationOrder.push(`set:commit:${call}`)
      },
    })
    installChromeStorage(storage.local)
    const { createOrUpdateUrlRecord } = await loadFreshUrlsModule()

    const firstMutation = createOrUpdateUrlRecord('https://example.com/a', 'A')
    await firstWriteStarted.promise

    const secondMutation = createOrUpdateUrlRecord('https://example.com/b', 'B')
    await Promise.resolve()

    expect(storage.reads).toHaveLength(1)
    expect(storage.writes).toHaveLength(1)
    expect(storage.commits).toHaveLength(0)

    allowFirstWriteCommit.resolve(undefined)
    await Promise.all([firstMutation, secondMutation])

    expect(operationOrder).toStrictEqual([
      'get:1',
      'set:start:1',
      'set:commit:1',
      'get:2',
      'set:start:2',
      'set:commit:2',
    ])
    expect(state.urls.map(({ url }) => url).toSorted()).toStrictEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
  })

  it('two module contexts reproduce the current lost-update limitation', async () => {
    const state: SharedUrlState = { urls: [] }
    const firstReadStarted = createDeferred<undefined>()
    const allowReadsToReturn = createDeferred<undefined>()
    const storage = createSharedUrlStorage(state, {
      afterReadSnapshot: async ({ call }) => {
        if (call === 1) {
          firstReadStarted.resolve(undefined)
        }
        await allowReadsToReturn.promise
      },
    })
    installChromeStorage(storage.local)
    const firstContext = await loadFreshUrlsModule()
    const secondContext = await loadFreshUrlsModule()

    const firstMutation = firstContext.createOrUpdateUrlRecord(
      'https://example.com/a',
      'A',
    )
    const secondMutation = secondContext.createOrUpdateUrlRecord(
      'https://example.com/b',
      'B',
    )

    let mutationResults: PromiseSettledResult<UrlRecord>[]
    try {
      await firstReadStarted.promise
      await Promise.resolve()
      await Promise.resolve()

      expect(
        storage.reads,
        'independent module queues must both capture a storage snapshot',
      ).toHaveLength(2)
      expect(storage.reads.map(({ records }) => records)).toStrictEqual([
        [],
        [],
      ])
      expect(storage.writes).toHaveLength(0)
    } finally {
      allowReadsToReturn.resolve(undefined)
      mutationResults = await Promise.allSettled([
        firstMutation,
        secondMutation,
      ])
    }

    const rejectedMutation = mutationResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (rejectedMutation) {
      throw rejectedMutation.reason
    }
    expect(mutationResults.map(({ status }) => status)).toStrictEqual([
      'fulfilled',
      'fulfilled',
    ])

    // Current module-local queues do not coordinate extension contexts. Issue
    // #726 must prevent this lost update in persistence model v2. The fake
    // store intentionally emits no onChanged event because both contexts hold
    // their snapshots before either write begins.
    expect(storage.writes).toHaveLength(2)
    expect(
      storage.writes.flatMap(({ records }) => records.map(({ url }) => url)),
    ).toHaveLength(2)
    expect(
      storage.writes
        .flatMap(({ records }) => records.map(({ url }) => url))
        .toSorted(),
    ).toStrictEqual(['https://example.com/a', 'https://example.com/b'])
    expect(state.urls).toHaveLength(1)
  })

  it('a fresh module reloads URL records from committed storage', async () => {
    const state: SharedUrlState = { urls: [] }
    const storage = createSharedUrlStorage(state)
    installChromeStorage(storage.local)
    const initialContext = await loadFreshUrlsModule()

    await initialContext.createOrUpdateUrlRecord('https://example.com/a', 'A')

    const restartedContext = await loadFreshUrlsModule()
    expect(restartedContext.createOrUpdateUrlRecord).not.toBe(
      initialContext.createOrUpdateUrlRecord,
    )

    await restartedContext.createOrUpdateUrlRecord('https://example.com/b', 'B')

    expect(storage.reads.map(({ records }) => records.length)).toStrictEqual([
      0, 1,
    ])
    expect(storage.writes).toHaveLength(2)
    expect(state.urls.map(({ url }) => url).toSorted()).toStrictEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
  })
})

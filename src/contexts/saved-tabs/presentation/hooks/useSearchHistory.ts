import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

import type { SavedTabsSearchHistoryPort } from '@/contexts/saved-tabs/application/ports/SavedTabsSearchHistoryPort'

const createHistoryStore = (port: SavedTabsSearchHistoryPort | undefined) => {
  let snapshot: { entries: string[]; error: boolean; ready: boolean } = {
    entries: [],
    error: false,
    ready: !port,
  }
  let revision = 0
  let active = false
  let unsubscribe: (() => void) | undefined
  const listeners = new Set<() => void>()
  const removalListeners = new Set<(removed: readonly string[]) => void>()
  const update = (next: typeof snapshot) => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }
  const refresh = () => {
    if (!port || !active) {
      return
    }
    const current = ++revision
    void port.read().then(
      (entries) => {
        if (active && current === revision) {
          update({ entries, error: false, ready: true })
        }
      },
      () => {
        if (active && current === revision) {
          update({ ...snapshot, error: true, ready: true })
        }
      },
    )
  }
  const start = () => {
    if (!port || active) {
      return
    }
    active = true
    try {
      unsubscribe = port.subscribe((removed) => {
        for (const listener of removalListeners) {
          listener(removed)
        }
        refresh()
      })
      refresh()
    } catch {
      update({ ...snapshot, error: true, ready: true })
      active = false
    }
  }
  const connect = () => {
    start()
    return () => {
      active = false
      revision++
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
  const mutate = async (
    operation: () => Promise<string[]>,
    signal?: AbortSignal,
  ) => {
    const current = ++revision
    try {
      const entries = await operation()
      if (current === revision && !signal?.aborted) {
        update({ ...snapshot, entries, error: false })
      }
    } catch (error) {
      if (!signal?.aborted) {
        revision++
        update({ ...snapshot, error: true })
      }
      throw error
    }
  }
  return {
    connect,
    retry: () => {
      if (active) {
        refresh()
      } else {
        start()
      }
    },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    subscribeRemovals: (listener: (removed: readonly string[]) => void) => {
      removalListeners.add(listener)
      return () => {
        removalListeners.delete(listener)
      }
    },
    record: async (query: string, signal: AbortSignal) => {
      if (port) {
        await mutate(async () => port.schedule(query, signal), signal)
      }
    },
    remove: async (query: string) => {
      if (!port) {
        throw new Error('Search history is unavailable')
      }
      await mutate(async () => port.remove(query))
    },
  }
}

export const useSearchHistory = (
  port: SavedTabsSearchHistoryPort | undefined,
  query: string,
  composing: boolean,
) => {
  const store = useMemo(() => createHistoryStore(port), [port])
  const pending = useRef<AbortController | undefined>(undefined)
  const suppressed = useRef<string | null>(null)
  const attempted = useRef<string | null>(null)
  useEffect(() => store.connect(), [store])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    suppressed.current = null
  }, [query])
  useEffect(() => {
    const controller = pending
    const suppression = suppressed
    return store.subscribeRemovals((removed) => {
      if (removed.includes(query.trim())) {
        suppression.current = query.trim()
        controller.current?.abort()
      }
    })
  }, [query, store])
  useEffect(() => {
    if (
      !port ||
      composing ||
      !query.trim() ||
      !snapshot.ready ||
      suppressed.current === query.trim()
    ) {
      return () => {}
    }
    if (snapshot.error) {
      if (attempted.current !== query.trim()) {
        attempted.current = query.trim()
        store.retry()
      }
      return () => {}
    }
    attempted.current = query.trim()
    const controller = new AbortController()
    pending.current = controller
    void store.record(query, controller.signal).catch(() => {})
    return () => {
      controller.abort()
    }
  }, [port, composing, query, store, snapshot.ready, snapshot.error])
  const handleRemove = useCallback(
    async (entry: string) => {
      if (entry === query.trim()) {
        suppressed.current = query.trim()
        pending.current?.abort()
      }
      await store.remove(entry)
    },
    [query, store],
  )
  return { ...snapshot, handleRemove }
}

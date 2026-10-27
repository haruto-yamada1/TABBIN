import { useEffect, useMemo, useSyncExternalStore } from 'react'

import type {
  SavedSearch,
  SavedSearchesPort,
} from '@/contexts/saved-tabs/application/ports/SavedSearchesPort'

const createStore = (port: SavedSearchesPort | undefined) => {
  let snapshot: {
    searches: SavedSearch[]
    loading: boolean
    loadError: boolean
  } = {
    searches: [],
    loading: Boolean(port),
    loadError: false,
  }
  let revision = 0
  const listeners = new Set<() => void>()
  const update = (next: typeof snapshot) => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }
  const connect = () => {
    if (!port) {
      return () => {}
    }
    let active = true
    const refresh = () => {
      const current = ++revision
      void port.list().then(
        (searches) => {
          if (active && current === revision) {
            update({ searches, loading: false, loadError: false })
          }
        },
        () => {
          if (active && current === revision) {
            update({ ...snapshot, loading: false, loadError: true })
          }
        },
      )
    }
    let unsubscribe: () => void
    try {
      unsubscribe = port.subscribe(refresh)
      refresh()
    } catch {
      update({ ...snapshot, loading: false, loadError: true })
      return () => {
        active = false
      }
    }
    return () => {
      active = false
      revision++
      unsubscribe()
    }
  }
  const mutate = async (operation: () => Promise<SavedSearch[]>) => {
    const current = ++revision
    const searches = await operation()
    if (current === revision) {
      update({ ...snapshot, searches })
    }
  }
  return {
    connect,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    handleSave: async (name: string, query: string) => {
      if (!port) {
        throw new Error('Saved searches are unavailable')
      }
      await mutate(async () => port.save(name, query))
    },
    handleRename: async (id: string, name: string) => {
      if (!port) {
        throw new Error('Saved searches are unavailable')
      }
      await mutate(async () => port.rename(id, name))
    },
    handleRemove: async (id: string) => {
      if (!port) {
        throw new Error('Saved searches are unavailable')
      }
      await mutate(async () => port.remove(id))
    },
  }
}

export const useSavedSearches = (port: SavedSearchesPort | undefined) => {
  const store = useMemo(() => createStore(port), [port])
  useEffect(() => store.connect(), [store])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return {
    ...snapshot,
    handleSave: store.handleSave,
    handleRename: store.handleRename,
    handleRemove: store.handleRemove,
  }
}

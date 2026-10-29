import type { Dispatch, SetStateAction } from 'react'

import type {
  SavedTabsSortPreferencesPort,
  SortOrder,
  SortScope,
} from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'

export type SortPreferenceKey = { scope: SortScope; id: string }

type Snapshot = { sortOrder: SortOrder; isPending: boolean }

// One mounted control owns its pending operation. Storage events are authoritative;
// a revision prevents a delayed initial read from replacing a newer delivery.
export const createSortPreferenceStore = (
  port: SavedTabsSortPreferencesPort | undefined,
  key: SortPreferenceKey | undefined,
  notifyError: () => void,
) => {
  let snapshot: Snapshot = {
    sortOrder: 'default',
    isPending: Boolean(port && key),
  }
  let confirmedOrder: SortOrder = 'default'
  let revision = 0
  let writing = false
  const listeners = new Set<() => void>()
  const update = (next: Snapshot) => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }
  const connect = () => {
    if (!port || !key) {
      return () => {}
    }
    let disposed = false
    let unsubscribe: () => void
    try {
      unsubscribe = port.subscribe(key.scope, key.id, (order) => {
        if (disposed) {
          return
        }
        revision++
        confirmedOrder = order
        update({ sortOrder: order, isPending: writing })
      })
    } catch {
      notifyError()
      return () => {}
    }
    const readRevision = ++revision
    void port.read(key.scope, key.id).then(
      (order) => {
        if (disposed || revision !== readRevision) {
          return
        }
        confirmedOrder = order
        update({ sortOrder: order, isPending: false })
      },
      () => {
        if (disposed || revision !== readRevision) {
          return
        }
        update({ ...snapshot, isPending: false })
        notifyError()
      },
    )
    return () => {
      disposed = true
      revision++
      unsubscribe()
    }
  }
  const setSortOrder: Dispatch<SetStateAction<SortOrder>> = (action) => {
    if (snapshot.isPending) {
      return
    }
    const order =
      typeof action === 'function' ? action(snapshot.sortOrder) : action
    if (order === snapshot.sortOrder) {
      return
    }
    if (!port || !key) {
      update({ sortOrder: order, isPending: false })
      return
    }
    writing = true
    const writeRevision = ++revision
    update({ sortOrder: order, isPending: true })
    void port.write(key.scope, key.id, order).then(
      () => {
        writing = false
        if (revision === writeRevision) {
          confirmedOrder = order
        }
        update({ ...snapshot, isPending: false })
      },
      () => {
        writing = false
        update({ sortOrder: confirmedOrder, isPending: false })
        notifyError()
      },
    )
  }
  return {
    connect,
    getSnapshot: () => snapshot,
    setSortOrder,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

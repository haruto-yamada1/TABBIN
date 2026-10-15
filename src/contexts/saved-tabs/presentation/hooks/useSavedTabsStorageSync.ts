import { useEffect, useLayoutEffect, useRef } from 'react'

import type {
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { logger } from '@/lib/logging/logger'

const CURRENT_DATA_HINT: TypedSavedTabsStorageChange = {
  key: 'urls',
  kind: 'noPayload',
  newValue: undefined,
  oldValue: undefined,
}

// All deliveries and lifecycle repairs share one drain, so an older read cannot
// finish after a newer one, including across effect cleanup/setup. Notifications
// remain hints; the query owns the data.
export const useSavedTabsStorageSync = (
  changePort: StorageChangePort,
  synchronize: (
    changes: readonly TypedSavedTabsStorageChange[],
  ) => Promise<void>,
  initialLoadComplete = true,
) => {
  const synchronizeRef = useRef(synchronize)
  const inFlightDrainRef = useRef<Promise<void> | undefined>(undefined)
  useLayoutEffect(() => {
    synchronizeRef.current = synchronize
  }, [synchronize])

  useEffect(() => {
    if (!initialLoadComplete) {
      return () => {}
    }
    let disposed = false
    const isDisposed = () => disposed
    let draining = false
    const pending = new Map<
      TypedSavedTabsStorageChange['key'],
      TypedSavedTabsStorageChange
    >()

    const drain = async (): Promise<void> => {
      if (isDisposed()) {
        return
      }
      const changes = [...pending.values()]
      pending.clear()
      try {
        await synchronizeRef.current(changes)
      } catch {
        logger.error('saved_tabs_synchronization_failed', {})
      }
      if (!isDisposed() && pending.size > 0) {
        return drain()
      }
      draining = false
    }
    const schedule = (changes: readonly TypedSavedTabsStorageChange[]) => {
      if (disposed) {
        return
      }
      for (const change of changes) {
        pending.set(change.key, change)
      }
      if (!draining) {
        draining = true
        const previous = inFlightDrainRef.current
        const current = previous ? previous.then(drain, drain) : drain()
        inFlightDrainRef.current = current
        const finish = () => {
          if (inFlightDrainRef.current === current) {
            inFlightDrainRef.current = undefined
          }
        }
        void current.then(finish, finish)
      }
    }
    const refresh = () => {
      schedule([CURRENT_DATA_HINT])
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    const unsubscribe = changePort.subscribe(schedule)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    // Subscribe before the initial repair, closing the mount/read race.
    refresh()
    return () => {
      disposed = true
      pending.clear()
      unsubscribe()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [changePort, initialLoadComplete])
}

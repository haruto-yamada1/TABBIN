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
// finish after a newer one. Notifications remain hints; the query owns the data.
export const useSavedTabsStorageSync = (
  changePort: StorageChangePort,
  synchronize: (
    changes: readonly TypedSavedTabsStorageChange[],
  ) => Promise<void>,
  initialLoadComplete = true,
) => {
  const synchronizeRef = useRef(synchronize)
  useLayoutEffect(() => {
    synchronizeRef.current = synchronize
  }, [synchronize])

  useEffect(() => {
    if (!initialLoadComplete) {
      return () => {}
    }
    let disposed = false
    let draining = false
    const pending = new Map<
      TypedSavedTabsStorageChange['key'],
      TypedSavedTabsStorageChange
    >()

    const drain = async (): Promise<void> => {
      draining = true
      const changes = [...pending.values()]
      pending.clear()
      try {
        await synchronizeRef.current(changes)
      } catch {
        logger.error('saved_tabs_synchronization_failed', {})
      }
      if (!disposed && pending.size > 0) {
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
        void drain()
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

import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { sendRuntimeMessage } from '@/lib/browser/runtime'
import type { BackgroundMessage } from '@/types/background'

let stopRelay: (() => void) | undefined

/** A runtime message wakes a suspended MV3 worker; BroadcastChannel alone cannot. */
export const startNativeTitleIndicatorRelay = (): (() => void) => {
  if (stopRelay) {
    return stopRelay
  }

  let stopped = false
  let pending = false
  let requestRevision = 0

  const requestRefresh = (): void => {
    if (stopped) {
      return
    }
    requestRevision += 1
    if (pending) {
      return
    }
    pending = true
    void Promise.resolve().then(async () => {
      const refreshingRevision = requestRevision
      try {
        if (!stopped) {
          await sendRuntimeMessage({
            action: 'refreshNativeSavedTabTitles',
          } satisfies BackgroundMessage)
        }
      } catch {
        // A transient runtime failure must not interrupt persistence or the UI.
      } finally {
        pending = false
        if (requestRevision !== refreshingRevision && !stopped) {
          requestRefresh()
        }
      }
    })
  }

  let unsubscribe: () => void
  try {
    unsubscribe = createBroadcastChannelPersistenceChangeAdapter().subscribe(
      (event) => {
        if (
          event.scopes.some(
            (scope) =>
              scope === 'urls' ||
              scope === 'memberships' ||
              scope === 'collections',
          )
        ) {
          requestRefresh()
        }
      },
    )
  } catch {
    return () => undefined
  }

  const stop = (): void => {
    if (stopped) {
      return
    }
    stopped = true
    unsubscribe()
    if (stopRelay === stop) {
      stopRelay = undefined
    }
  }
  stopRelay = stop
  return stop
}

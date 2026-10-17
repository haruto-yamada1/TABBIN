import { useSyncExternalStore } from 'react'

const CLOCK_INTERVAL_MS = 60_000
const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const getSnapshot = () => now
const getInactiveSnapshot = () => 0
const subscribeInactive = () => () => {}

const refresh = () => {
  now = Date.now()
  for (const listener of listeners) {
    listener()
  }
}

// One clock per extension page regardless of the number of visible URL rows.
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    timer = setInterval(refresh, CLOCK_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }
}

export const useSavedTimeClock = (enabled: boolean) =>
  useSyncExternalStore(
    enabled ? subscribe : subscribeInactive,
    enabled ? getSnapshot : getInactiveSnapshot,
    getInactiveSnapshot,
  )

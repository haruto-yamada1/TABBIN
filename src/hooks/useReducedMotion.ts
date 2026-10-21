import { useSyncExternalStore } from 'react'

import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '@/lib/reducedMotion'

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, prefersReducedMotion, () => false)

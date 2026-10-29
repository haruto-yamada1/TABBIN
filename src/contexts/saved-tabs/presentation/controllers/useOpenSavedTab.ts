import { useCallback, useSyncExternalStore } from 'react'

import { useSavedTabsUseCases } from './SavedTabsUseCasesContext'

const noop = () => {}
const getServerSnapshot = () => false

export const useOpenSavedTab = (url: string): boolean => {
  const port = useSavedTabsUseCases()?.deps.openSavedTabsPort
  const subscribe = useCallback(
    (listener: () => void) => port?.subscribe(url, listener) ?? noop,
    [port, url],
  )
  const getSnapshot = useCallback(
    () => port?.getSnapshot(url) ?? false,
    [port, url],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

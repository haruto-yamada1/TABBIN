import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { toast } from 'sonner'

import { useSavedTabsUseCases } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { createSortPreferenceStore } from './sortPreferenceStore'
import type { SortPreferenceKey } from './sortPreferenceStore'

export const useSavedTabsSortOrder = (key?: SortPreferenceKey) => {
  const port = useSavedTabsUseCases()?.deps.sortPreferencesPort
  const { t } = useI18n()
  const translateRef = useRef(t)
  useLayoutEffect(() => {
    translateRef.current = t
  }, [t])
  const notifyError = useCallback(() => {
    toast.error(translateRef.current('savedTabs.dnd.saveError'))
  }, [])
  const scope = key?.scope
  const id = key?.id
  const store = useMemo(
    () =>
      createSortPreferenceStore(
        port,
        scope !== undefined && id !== undefined ? { scope, id } : undefined,
        notifyError,
      ),
    [port, scope, id, notifyError],
  )
  useEffect(() => store.connect(), [store])
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  return {
    ...snapshot,
    canReorderUrls: snapshot.sortOrder === 'default' && !snapshot.isPending,
    setSortOrder: store.setSortOrder,
  }
}

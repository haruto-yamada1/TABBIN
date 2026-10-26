import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useSavedTabsUseCases } from './SavedTabsUseCasesContext'

export const useSavedUrlFavorite = (url: string, isFavorite: boolean) => {
  const context = useSavedTabsUseCases()
  const { t } = useI18n()
  const busy = useRef(false)
  const [isPending, setIsPending] = useState(false)
  const toggle = useCallback(async () => {
    if (!context || busy.current) {
      return
    }
    busy.current = true
    setIsPending(true)
    try {
      await context.useCases.setSavedUrlFavorite({
        url,
        isFavorite: !isFavorite,
      })
    } catch {
      toast.error(t('savedTabs.favorite.saveError'))
    } finally {
      busy.current = false
      setIsPending(false)
    }
  }, [context, isFavorite, t, url])
  return { toggle, isPending, isAvailable: context !== null }
}

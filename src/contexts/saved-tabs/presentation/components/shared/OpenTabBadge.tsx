import { useOpenSavedTab } from '@/contexts/saved-tabs/presentation/controllers/useOpenSavedTab'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const OpenTabBadge = ({ url }: { url: string }) => {
  const isOpen = useOpenSavedTab(url)
  const { t } = useI18n()

  return isOpen ? (
    <span className='mx-1 shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] whitespace-nowrap text-secondary-foreground'>
      {t('savedTabs.url.openNow')}
    </span>
  ) : null
}

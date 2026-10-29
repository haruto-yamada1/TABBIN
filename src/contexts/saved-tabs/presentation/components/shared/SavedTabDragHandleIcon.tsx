import { GripVertical } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

/** Keep the drag activator on its existing parent; only its visual is decorated. */
export const SavedTabDragHandleIcon = ({
  isOpen,
  descriptionId,
}: {
  isOpen: boolean
  descriptionId: string
}) => {
  const { t } = useI18n()
  const icon = (
    <GripVertical
      size={16}
      aria-hidden='true'
      data-testid='saved-tab-drag-icon'
      className={
        isOpen
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground'
      }
    />
  )
  return isOpen ? (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='flex'>{icon}</span>
        </TooltipTrigger>
        <TooltipContent>{t('savedTabs.url.openNow')}</TooltipContent>
      </Tooltip>
      <span id={descriptionId} className='sr-only'>
        {t('savedTabs.url.openNow')}
      </span>
    </>
  ) : (
    icon
  )
}

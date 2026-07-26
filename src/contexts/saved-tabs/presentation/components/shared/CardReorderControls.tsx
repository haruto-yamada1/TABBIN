import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './SavedTabsResponsive'

/** CardReorderControls の props */
type CardReorderControlsProps = {
  /** 並び替えモード */
  isReorderMode: boolean
  /** 並び替えキャンセル */
  onCancel: () => void
  /** 並び替え確定 */
  onConfirm: () => void
  /** コンテナのクラス */
  className?: string
  /** キャンセルボタンの aria-label */
  cancelLabel?: string
  /** 確定ボタンの aria-label */
  confirmLabel?: string
}

/**
 * 並び替え確定・キャンセルボタン
 * @param props CardReorderControlsProps
 */
export const CardReorderControls = ({
  isReorderMode,
  onCancel,
  onConfirm,
  className,
  cancelLabel,
  confirmLabel,
}: CardReorderControlsProps) => {
  const { t } = useI18n()
  if (!isReorderMode) {
    return null
  }
  const resolvedCancelLabel = cancelLabel ?? t('savedTabs.reorder.cancelAria')
  const resolvedConfirmLabel =
    confirmLabel ?? t('savedTabs.reorder.confirmAria')

  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            onClick={onCancel}
            className='flex cursor-pointer items-center gap-1'
            aria-label={resolvedCancelLabel}
          >
            <X size={14} />
            <SavedTabsResponsiveLabel>
              {t('savedTabs.reorder.cancel')}
            </SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {resolvedCancelLabel}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='default'
            size='sm'
            onClick={onConfirm}
            className='flex cursor-pointer items-center gap-1'
            aria-label={resolvedConfirmLabel}
          >
            <Check size={14} />
            <SavedTabsResponsiveLabel>
              {t('savedTabs.reorder.confirm')}
            </SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {resolvedConfirmLabel}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
    </div>
  )
}

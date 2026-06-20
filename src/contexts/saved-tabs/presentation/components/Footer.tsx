import { Check, X } from 'lucide-react'
import type { ComponentType } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

interface CategoryReorderFooterProps {
  onConfirmCategoryReorder?: () => void
  onCancelCategoryReorder?: () => void
}

const noopCategoryReorderAction = () => {}

const ReorderTooltipButton = ({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  variant = 'outline',
}: {
  icon: ComponentType<{ size: number }>
  label: string
  ariaLabel: string
  onClick: () => void
  variant?: 'outline' | 'default'
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={variant}
        size='sm'
        onClick={onClick}
        className='flex cursor-pointer items-center gap-1'
        aria-label={ariaLabel}
      >
        <Icon size={16} />
        <span>{label}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent side='top'>{ariaLabel}</TooltipContent>
  </Tooltip>
)

export const CategoryReorderFooter = ({
  onConfirmCategoryReorder = noopCategoryReorderAction,
  onCancelCategoryReorder = noopCategoryReorderAction,
}: CategoryReorderFooterProps) => {
  const { t } = useI18n()

  return (
    <div className='fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='container mx-auto flex items-center justify-center gap-4 px-4 py-3'>
        <div className='flex items-center gap-2'>
          <ReorderTooltipButton
            icon={X}
            label={t('savedTabs.reorder.cancel')}
            ariaLabel={t('savedTabs.reorder.cancelAria')}
            onClick={onCancelCategoryReorder}
          />
          <ReorderTooltipButton
            icon={Check}
            label={t('savedTabs.reorder.confirm')}
            ariaLabel={t('savedTabs.reorder.confirmAria')}
            onClick={onConfirmCategoryReorder}
            variant='default'
          />
        </div>
      </div>
    </div>
  )
}

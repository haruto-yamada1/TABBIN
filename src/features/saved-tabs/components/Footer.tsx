import { Check, X } from 'lucide-react'

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

export const CategoryReorderFooter = ({
  onConfirmCategoryReorder = () => {},
  onCancelCategoryReorder = () => {},
}: CategoryReorderFooterProps) => {
  const { t } = useI18n()

  return (
    <div className='fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='container mx-auto flex items-center justify-center gap-4 px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                onClick={onCancelCategoryReorder}
                className='flex cursor-pointer items-center gap-1'
                aria-label={t('savedTabs.reorder.cancelAria')}
              >
                <X size={16} />
                <span>{t('savedTabs.reorder.cancel')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>
              {t('savedTabs.reorder.cancelAria')}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='default'
                size='sm'
                onClick={onConfirmCategoryReorder}
                className='flex cursor-pointer items-center gap-1'
                aria-label={t('savedTabs.reorder.confirmAria')}
              >
                <Check size={16} />
                <span>{t('savedTabs.reorder.confirm')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>
              {t('savedTabs.reorder.confirmAria')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

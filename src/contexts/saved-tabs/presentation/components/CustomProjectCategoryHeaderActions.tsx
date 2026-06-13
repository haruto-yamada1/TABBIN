import { ExternalLink, Settings, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'

interface CategoryHeaderActionsProps {
  showManageActions: boolean
  showBulkActions: boolean
  onOpenManageDialog: () => void
  onOpenAllClick: () => void
  onDeleteAllClick: () => void
}

export const CustomProjectCategoryHeaderActions = ({
  showManageActions,
  showBulkActions,
  onOpenManageDialog,
  onOpenAllClick,
  onDeleteAllClick,
}: CategoryHeaderActionsProps) => {
  const { t } = useI18n()

  return (
    <div className='flex items-center gap-1'>
      {showManageActions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              className='flex cursor-pointer items-center gap-1'
              onClick={onOpenManageDialog}
              aria-label={t('savedTabs.projectCategory.manage')}
            >
              <Settings size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.projectCategory.manage')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {t('savedTabs.projectCategory.manage')}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>
      )}

      {showBulkActions && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                className='flex cursor-pointer items-center gap-1'
                onClick={onOpenAllClick}
                aria-label={t('savedTabs.openAll')}
              >
                <ExternalLink size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.openAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.openAll')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                className='flex cursor-pointer items-center gap-1'
                onClick={onDeleteAllClick}
                aria-label={t('savedTabs.deleteAll')}
              >
                <Trash2 size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.deleteAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.deleteAll')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )
}

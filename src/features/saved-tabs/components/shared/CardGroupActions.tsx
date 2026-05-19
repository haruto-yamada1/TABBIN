import { ExternalLink, Settings, Trash } from 'lucide-react'
import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './SavedTabsResponsive'

interface CardGroupActionsProps {
  onOpenAll?: () => void
  onDeleteAll?: () => void
  onManage?: () => void
  onConfirmOpenAll?: boolean
  onConfirmDeleteAll?: boolean
  openAllThreshold?: number
  itemName?: string
  warningMessage?: string
  manageLabel?: string
}

/**
 * 汎用的なカードグループ操作ボタン群
 * すべて開く、すべて削除、管理（オプション）を含む
 */
export const CardGroupActions = ({
  onOpenAll,
  onDeleteAll,
  onManage,
  onConfirmOpenAll = false,
  onConfirmDeleteAll = false,
  openAllThreshold = 10,
  itemName,
  warningMessage,
  manageLabel,
}: CardGroupActionsProps) => {
  const { t } = useI18n()
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const resolvedManageLabel = manageLabel ?? t('common.manage')
  const resolvedItemName = itemName ?? t('savedTabs.openAllTabs')
  const resolvedWarningMessage =
    warningMessage ?? t('savedTabs.deleteAllDefaultWarning')

  return (
    <>
      <div className='pointer-events-auto ml-2 flex shrink-0 gap-2'>
        {/* 管理ボタン (オプション) */}
        {onManage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                onClick={onManage}
                className='flex cursor-pointer items-center gap-1'
                aria-label={resolvedManageLabel}
              >
                <Settings size={14} />
                <SavedTabsResponsiveLabel>
                  {resolvedManageLabel}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {resolvedManageLabel}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        )}

        {/* すべて開く */}
        {onOpenAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  if (onConfirmOpenAll) {
                    setIsOpenAllConfirmOpen(true)
                  } else {
                    onOpenAll()
                  }
                }}
                className='flex cursor-pointer items-center gap-1'
                aria-label={t('savedTabs.openAllTabs')}
              >
                <ExternalLink size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.openAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.openAllTabs')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        )}

        {/* すべて削除 */}
        {onDeleteAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (onConfirmDeleteAll) {
                    setIsDeleteAllConfirmOpen(true)
                  } else {
                    onDeleteAll()
                  }
                }}
                className='flex cursor-pointer items-center gap-1'
                aria-label={t('savedTabs.deleteAll')}
              >
                <Trash size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.deleteAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.deleteAll')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        )}
      </div>

      {/* タブを開く確認ダイアログ */}
      {onOpenAll && (
        <AlertDialog
          open={isOpenAllConfirmOpen}
          onOpenChange={setIsOpenAllConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('savedTabs.openAllConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('savedTabs.openAllConfirmDescription', undefined, {
                  count: String(openAllThreshold),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onOpenAll()
                }}
              >
                {t('common.open')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 全削除確認ダイアログ */}
      {onDeleteAll && (
        <AlertDialog
          open={isDeleteAllConfirmOpen}
          onOpenChange={setIsDeleteAllConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('savedTabs.deleteAllTitle', undefined, {
                  itemName: resolvedItemName,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {resolvedWarningMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant='destructive' onClick={onDeleteAll}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

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
  openAllCount?: number
  itemName?: string
  warningMessage?: string
  manageLabel?: string
  manageAriaLabel?: string
  manageTooltip?: string
  openAllAriaLabel?: string
  openAllTooltip?: string
  openAllConfirmDescription?: string
  deleteAllAriaLabel?: string
  deleteAllTooltip?: string
  deleteAllConfirmDescription?: string
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
  openAllCount,
  itemName,
  warningMessage,
  manageLabel,
  manageAriaLabel,
  manageTooltip,
  openAllAriaLabel,
  openAllTooltip,
  openAllConfirmDescription,
  deleteAllAriaLabel,
  deleteAllTooltip,
  deleteAllConfirmDescription,
}: CardGroupActionsProps) => {
  const { t } = useI18n()
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const resolvedManageLabel = manageLabel ?? t('common.manage')
  const resolvedItemName = itemName ?? t('savedTabs.openAllTabs')
  const resolvedWarningMessage =
    warningMessage ?? t('savedTabs.deleteAllDefaultWarning')
  const resolvedManageAriaLabel = manageAriaLabel ?? resolvedManageLabel
  const resolvedManageTooltip = manageTooltip ?? resolvedManageLabel
  const resolvedOpenAllAriaLabel =
    openAllAriaLabel ?? t('savedTabs.openAllTabs')
  const resolvedOpenAllTooltip = openAllTooltip ?? t('savedTabs.openAllTabs')
  const resolvedOpenAllConfirmDescription =
    openAllConfirmDescription ??
    t('savedTabs.openAllConfirmDescription', undefined, {
      count: String(openAllCount ?? openAllThreshold),
    })
  const resolvedDeleteAllAriaLabel =
    deleteAllAriaLabel ?? t('savedTabs.deleteAll')
  const resolvedDeleteAllTooltip = deleteAllTooltip ?? t('savedTabs.deleteAll')
  const resolvedDeleteAllConfirmDescription =
    deleteAllConfirmDescription ?? resolvedWarningMessage

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
                aria-label={resolvedManageAriaLabel}
              >
                <Settings size={14} />
                <SavedTabsResponsiveLabel>
                  {resolvedManageLabel}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {resolvedManageTooltip}
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
                aria-label={resolvedOpenAllAriaLabel}
              >
                <ExternalLink size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.openAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {resolvedOpenAllTooltip}
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
                aria-label={resolvedDeleteAllAriaLabel}
              >
                <Trash size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.deleteAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {resolvedDeleteAllTooltip}
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
                {resolvedOpenAllConfirmDescription}
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
                {resolvedDeleteAllConfirmDescription}
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

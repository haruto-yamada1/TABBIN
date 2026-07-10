import { useCallback } from 'react'

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
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type AnalyticsDialogsProps = {
  isBulkDeleteConfirmOpen: boolean
  isOpenAllConfirmOpen: boolean
  deleteTarget: AiSavedUrlRecord | null
  onBulkDeleteConfirmOpenChange: (isOpen: boolean) => void
  onPerformBulkDelete: () => void
  onOpenAllConfirmOpenChange: (isOpen: boolean) => void
  onOpenAllDrilldownRecords: () => void
  onDeleteTargetChange: (isOpen: boolean) => void
  onRunConfirmedDelete: () => void
}

export const AnalyticsDialogs = ({
  isBulkDeleteConfirmOpen,
  isOpenAllConfirmOpen,
  deleteTarget,
  onBulkDeleteConfirmOpenChange,
  onPerformBulkDelete,
  onOpenAllConfirmOpenChange,
  onOpenAllDrilldownRecords,
  onDeleteTargetChange,
  onRunConfirmedDelete,
}: AnalyticsDialogsProps) => {
  const { t } = useI18n()

  const handleBulkDelete = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      onPerformBulkDelete()
    },
    [onPerformBulkDelete],
  )

  const handleOpenAll = useCallback(() => {
    onOpenAllDrilldownRecords()
  }, [onOpenAllDrilldownRecords])

  const handleConfirmedDelete = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      onRunConfirmedDelete()
    },
    [onRunConfirmedDelete],
  )

  return (
    <>
      <AlertDialog
        onOpenChange={onBulkDeleteConfirmOpenChange}
        open={isBulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.deleteAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.deleteAllDefaultWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={handleBulkDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={onOpenAllConfirmOpenChange}
        open={isOpenAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.openAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.openAllConfirmDescription', undefined, {
                count: '10',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleOpenAll}>
              {t('common.open')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={onDeleteTargetChange}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.url.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.url.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleConfirmedDelete}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

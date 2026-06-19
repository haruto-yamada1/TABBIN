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

interface AnalyticsDialogsProps {
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
            <AlertDialogAction
              variant='destructive'
              onClick={(event) => {
                event.preventDefault()
                onPerformBulkDelete()
              }}
            >
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
            <AlertDialogAction
              onClick={() => {
                onOpenAllDrilldownRecords()
              }}
            >
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
              onClick={(event) => {
                event.preventDefault()
                onRunConfirmedDelete()
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

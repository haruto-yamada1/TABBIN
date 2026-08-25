import { RotateCcw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { PersistenceRecoverySnapshotSummary } from '@/contexts/saved-tabs/public-api'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { formatLocaleDateTime } from '@/utils/localDateTime'

type RecoverySnapshotNoticeProps = {
  readonly isRestoring: boolean
  readonly onRestore: () => Promise<void>
  readonly snapshot: PersistenceRecoverySnapshotSummary
}

export const RecoverySnapshotNotice: React.FC<RecoverySnapshotNoticeProps> = ({
  isRestoring,
  onRestore,
  snapshot,
}) => {
  const { t } = useI18n()

  return (
    <div className='space-y-3'>
      <Alert>
        <RotateCcw className='size-4' />
        <AlertTitle>{t('options.importExport.recoveryTitle')}</AlertTitle>
        <AlertDescription>
          {t('options.importExport.recoveryDescription', undefined, {
            createdAt: formatLocaleDateTime(snapshot.createdAt),
            expiresAt: formatLocaleDateTime(snapshot.expiresAt),
          })}
        </AlertDescription>
      </Alert>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            className='cursor-pointer'
            disabled={isRestoring}
            size='sm'
            variant='outline'
          >
            <RotateCcw />
            {isRestoring
              ? t('options.importExport.recoveryRestoring')
              : t('options.importExport.recoveryRestore')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('options.importExport.recoveryRestoreConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('options.importExport.recoveryRestoreConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring}
              // eslint-disable-next-line typescript/no-misused-promises
              onClick={onRestore}
            >
              {t('options.importExport.recoveryRestoreConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

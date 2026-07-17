import { Download, HardDrive, RotateCcw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { PersistenceCapacityErrorCode } from '@/lib/persistence/capacity'

type PersistenceCapacityRecoveryProps = {
  errorCode: PersistenceCapacityErrorCode
  onBackup: () => void
  onRetry: () => void
}

const reasonKeyByErrorCode: Record<PersistenceCapacityErrorCode, string> = {
  PERSISTENCE_CAPACITY_PREFLIGHT_FAILED:
    'options.persistenceRecovery.preflightFailed',
  PERSISTENCE_DISK_WRITE_FAILED: 'options.persistenceRecovery.diskWriteFailed',
  PERSISTENCE_QUOTA_EXCEEDED: 'options.persistenceRecovery.quotaExceeded',
  PERSISTENCE_STORAGE_UNAVAILABLE:
    'options.persistenceRecovery.storageUnavailable',
}

export const PersistenceCapacityRecovery: React.FC<
  PersistenceCapacityRecoveryProps
> = ({ errorCode, onBackup, onRetry }) => {
  const { t } = useI18n()

  return (
    <Alert variant='destructive'>
      <HardDrive className='size-4' />
      <AlertTitle>{t('options.persistenceRecovery.title')}</AlertTitle>
      <AlertDescription className='space-y-3'>
        <p>{t(reasonKeyByErrorCode[errorCode])}</p>
        <p>{t('options.persistenceRecovery.description')}</p>
        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='outline' onClick={onBackup}>
            <Download className='size-4' />
            {t('options.persistenceRecovery.backup')}
          </Button>
          <Button type='button' onClick={onRetry}>
            <RotateCcw className='size-4' />
            {t('options.persistenceRecovery.retry')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

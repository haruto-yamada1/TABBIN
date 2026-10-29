import { AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  listBackupRecoverySnapshots,
  restoreBackupRecoverySnapshot,
} from '@/app/composition/optionsBackupRecovery'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { PersistenceRecoverySnapshotSummary } from '@/contexts/saved-tabs/public-api'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { ImportFileDialog } from '@/features/options/ImportFileDialog'
import { sendRuntimeMessage } from '@/lib/browser/runtime'
import { logger } from '@/lib/logging/logger'

import { ExportBackupDialog } from './ExportBackupDialog'
import { RecoverySnapshotNotice } from './RecoverySnapshotNotice'

export const ImportExportSettings: React.FC = () => {
  const { t } = useI18n()
  const [isRestoring, setIsRestoring] = useState(false)
  const [recoverySnapshots, setRecoverySnapshots] = useState<
    readonly PersistenceRecoverySnapshotSummary[]
  >([])
  const recoverySnapshotRequestGeneration = useRef(0)

  const refreshRecoverySnapshots = useCallback(async () => {
    const requestGeneration = ++recoverySnapshotRequestGeneration.current
    try {
      const snapshots = await listBackupRecoverySnapshots()
      if (requestGeneration === recoverySnapshotRequestGeneration.current) {
        setRecoverySnapshots(snapshots)
      }
    } catch {
      if (requestGeneration === recoverySnapshotRequestGeneration.current) {
        setRecoverySnapshots([])
      }
    }
  }, [])

  useEffect(() => {
    const requestGeneration = ++recoverySnapshotRequestGeneration.current
    void listBackupRecoverySnapshots()
      .then((snapshots) => {
        if (requestGeneration === recoverySnapshotRequestGeneration.current) {
          setRecoverySnapshots(snapshots)
        }
      })
      .catch(() => {
        if (requestGeneration === recoverySnapshotRequestGeneration.current) {
          setRecoverySnapshots([])
        }
      })
    return () => {
      recoverySnapshotRequestGeneration.current += 1
    }
  }, [])

  const handleImportSuccess = useCallback(async () => {
    await Promise.all([
      sendRuntimeMessage({ action: 'settingsImported' }),
      refreshRecoverySnapshots(),
    ])
  }, [refreshRecoverySnapshots])

  const recoverySnapshot = recoverySnapshots.at(0)
  const handleRestore = useCallback(async () => {
    if (!recoverySnapshot) {
      return
    }
    setIsRestoring(true)
    try {
      try {
        await restoreBackupRecoverySnapshot(recoverySnapshot.id)
      } catch {
        console.error('回復ポイントからの復元エラー')
        toast.error(t('options.importExport.recoveryRestoreError'))
        return
      }

      const logPostRestoreFailure = (error: unknown, action: string): void => {
        logger.error('recovery_postrestore_sync_failed', error, { action })
      }
      await Promise.all([
        sendRuntimeMessage({ action: 'settingsImported' }).catch(
          (error: unknown) => {
            logPostRestoreFailure(error, 'notifySettingsImported')
          },
        ),
        refreshRecoverySnapshots().catch((error: unknown) => {
          logPostRestoreFailure(error, 'refreshRecoverySnapshots')
        }),
      ])
      toast.success(t('options.importExport.recoveryRestoreSuccess'))
    } finally {
      setIsRestoring(false)
    }
  }, [recoverySnapshot, refreshRecoverySnapshots, t])

  return (
    <div className='space-y-4'>
      <Alert>
        <AlertCircle className='size-4' />
        <AlertTitle>{t('options.importExport.scopeTitle')}</AlertTitle>
        <AlertDescription>
          {t('options.importExport.scopeDescription')}
        </AlertDescription>
      </Alert>

      {recoverySnapshot ? (
        <RecoverySnapshotNotice
          isRestoring={isRestoring}
          onRestore={handleRestore}
          snapshot={recoverySnapshot}
        />
      ) : null}

      <div className='flex flex-wrap gap-2'>
        <ExportBackupDialog />

        <ImportFileDialog onImportSuccess={handleImportSuccess} />
      </div>
    </div>
  )
}

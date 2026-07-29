import { AlertCircle, Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  listBackupRecoverySnapshots,
  restoreBackupRecoverySnapshot,
} from '@/app/composition/optionsBackupRecovery'
import { exportBackupV2 } from '@/app/composition/optionsBackupV2Export'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { PersistenceRecoverySnapshotSummary } from '@/contexts/saved-tabs/public-api'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { ImportFileDialog } from '@/features/options/ImportFileDialog'
import { downloadAsJson } from '@/features/options/lib/import-export'
import { sendRuntimeMessage } from '@/lib/browser/runtime'

import { RecoverySnapshotNotice } from './RecoverySnapshotNotice'

export const ImportExportSettings: React.FC = () => {
  const { t } = useI18n()
  const [isExporting, setIsExporting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [recoverySnapshots, setRecoverySnapshots] = useState<
    readonly PersistenceRecoverySnapshotSummary[]
  >([])

  const refreshRecoverySnapshots = useCallback(async () => {
    try {
      setRecoverySnapshots(await listBackupRecoverySnapshots())
    } catch {
      setRecoverySnapshots([])
    }
  }, [])

  useEffect(() => {
    let isActive = true
    void listBackupRecoverySnapshots()
      .then((snapshots) => {
        if (isActive) {
          setRecoverySnapshots(snapshots)
        }
      })
      .catch(() => {
        if (isActive) {
          setRecoverySnapshots([])
        }
      })
    return () => {
      isActive = false
    }
  }, [])

  const handleImportSuccess = useCallback(async () => {
    await Promise.all([
      sendRuntimeMessage({ action: 'settingsImported' }),
      refreshRecoverySnapshots(),
    ])
  }, [refreshRecoverySnapshots])

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true)
      const data = await exportBackupV2()

      const date = new Date()
      const formattedDate = date.toISOString().split('T')[0]
      const filename = `tab-manager-backup-${formattedDate}.json`

      downloadAsJson(data, filename)
      toast.success(t('options.importExport.exportSuccess'))
    } catch {
      console.error('エクスポートエラー')
      toast.error(t('options.importExport.exportError'))
    } finally {
      setIsExporting(false)
    }
  }, [t])

  const recoverySnapshot = recoverySnapshots.at(0)
  const handleRestore = useCallback(async () => {
    if (!recoverySnapshot) {
      return
    }
    try {
      setIsRestoring(true)
      await restoreBackupRecoverySnapshot(recoverySnapshot.id)
      await Promise.all([
        sendRuntimeMessage({ action: 'settingsImported' }),
        refreshRecoverySnapshots(),
      ])
      toast.success(t('options.importExport.recoveryRestoreSuccess'))
    } catch {
      console.error('回復ポイントからの復元エラー')
      toast.error(t('options.importExport.recoveryRestoreError'))
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
        <Button
          // eslint-disable-next-line typescript/no-misused-promises
          onClick={handleExport}
          disabled={isExporting}
          variant='outline'
          className='flex w-full cursor-pointer items-center justify-start gap-2'
        >
          <Download size={16} />
          {isExporting
            ? t('options.importExport.exporting')
            : t('options.importExport.export')}
        </Button>

        <ImportFileDialog onImportSuccess={handleImportSuccess} />
      </div>
    </div>
  )
}

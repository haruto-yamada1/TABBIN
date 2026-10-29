import { Download } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { exportBackupV2 } from '@/app/composition/optionsBackupV2Export'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { downloadAsJson } from '@/features/options/lib/import-export'

import { BackupExportPreview } from './BackupExportPreview'
import type { BackupEnvelopeV2 } from './lib/import-export/v2/BackupV2Schema'

const ISO_DATE_LENGTH = 10

export const ExportBackupDialog = () => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [backup, setBackup] = useState<BackupEnvelopeV2 | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const generation = useRef(0)
  const downloadInFlight = useRef(false)

  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const prepare = useCallback(async () => {
    const request = ++generation.current
    try {
      const snapshot = await exportBackupV2()
      if (request === generation.current) {
        setBackup(snapshot)
      }
    } catch {
      if (request === generation.current) {
        setOpen(false)
        toast.error(t('options.importExport.exportError'))
      }
    }
  }, [t])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (downloadInFlight.current) {
        return
      }
      generation.current += 1
      setBackup(null)
      setOpen(nextOpen)
      if (nextOpen) {
        void prepare()
      }
    },
    [prepare],
  )

  const handleDownload = useCallback(
    (selected: BackupEnvelopeV2) => {
      if (downloadInFlight.current) {
        return
      }
      downloadInFlight.current = true
      setIsDownloading(true)
      const request = generation.current
      const filename = `tab-manager-backup-${selected.exportedAt.slice(0, ISO_DATE_LENGTH)}.json`
      void downloadAsJson(selected, filename)
        .then(() => {
          if (request === generation.current) {
            setOpen(false)
            setBackup(null)
            toast.success(t('options.importExport.exportSuccess'))
          }
        })
        .catch(() => {
          if (request === generation.current) {
            toast.error(t('options.importExport.exportError'))
          }
        })
        .finally(() => {
          downloadInFlight.current = false
          if (request === generation.current) {
            setIsDownloading(false)
          }
        })
    },
    [t],
  )

  const cancel = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant='outline'
          className='flex w-full cursor-pointer items-center justify-start gap-2'
        >
          <Download size={16} />
          {t('options.importExport.export')}
        </Button>
      </DialogTrigger>
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {t('options.importExport.exportPreviewTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('options.importExport.exportPreviewDescription')}
          </DialogDescription>
        </DialogHeader>
        {backup ? (
          <BackupExportPreview
            backup={backup}
            disabled={isDownloading}
            onCancel={cancel}
            onConfirm={handleDownload}
          />
        ) : (
          <>
            <output>{t('options.importExport.preparingExport')}</output>
            <DialogFooter>
              <Button variant='outline' onClick={cancel}>
                {t('options.importExport.cancel')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

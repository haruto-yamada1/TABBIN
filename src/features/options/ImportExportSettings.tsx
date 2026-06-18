import { AlertCircle, Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { ImportFileDialog } from '@/features/options/ImportFileDialog'
import {
  downloadAsJson,
  exportSettings,
} from '@/features/options/lib/import-export'
import { sendRuntimeMessage } from '@/lib/browser/runtime'

const handleImportSuccess = async () => {
  await sendRuntimeMessage({ action: 'settingsImported' })
}

export const ImportExportSettings: React.FC = () => {
  const { t } = useI18n()
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const data = await exportSettings()

      const date = new Date()
      const formattedDate = date.toISOString().split('T')[0]
      const filename = `tab-manager-backup-${formattedDate}.json`

      downloadAsJson(data, filename)
      toast.success(t('options.importExport.exportSuccess'))
    } catch (error) {
      console.error('エクスポートエラー:', error)
      toast.error(t('options.importExport.exportError'))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className='gap-y-4'>
      <Alert>
        <AlertCircle className='size-4' />
        <AlertTitle>{t('options.importExport.scopeTitle')}</AlertTitle>
        <AlertDescription>
          {t('options.importExport.scopeDescription')}
        </AlertDescription>
      </Alert>

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

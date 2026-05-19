import { AlertCircle, Download, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  downloadAsJson,
  exportSettings,
  importSettings,
} from '@/features/options/lib/import-export'
import { sendRuntimeMessage } from '@/lib/browser/runtime'

export const ImportExportSettings: React.FC = () => {
  const { t } = useI18n()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mergeData, setMergeData] = useState(true) // マージオプションの状態

  // エクスポート処理
  const handleExport = async () => {
    try {
      setIsExporting(true)
      const data = await exportSettings()

      // ファイル名に日付を追加 (YYYY-MM-DD形式)
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

  // インポートダイアログを開く
  const handleOpenImportDialog = () => {
    setImportDialogOpen(true)
  }

  // ファイル読み込み処理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    processFile(file)
  }

  // ファイル処理の共通関数
  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.json')) {
        toast.error(t('options.importExport.invalidJson'))
        return
      }

      setIsImporting(true)

      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string
          if (!content) {
            toast.error(t('options.importExport.readError'))
            return
          }

          const result = await importSettings(content, mergeData, t)
          if (result.success) {
            toast.success(result.message)
            setImportDialogOpen(false)

            // バックグラウンドに更新を通知
            await sendRuntimeMessage({ action: 'settingsImported' })
          } else {
            toast.error(result.message)
          }
        } catch (error) {
          console.error('インポートエラー:', error)
          toast.error(t('options.importExport.importError'))
        } finally {
          setIsImporting(false)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }
      }

      reader.onerror = () => {
        toast.error(t('options.importExport.readError'))
        setIsImporting(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }

      reader.readAsText(file)
    },
    [mergeData, t],
  )

  // React-dropzoneの設定
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0])
      }
    },
    [processFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/json': ['.json'],
    },
    maxFiles: 1,
    multiple: false,
    onDrop,
  })

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

        <Button
          onClick={handleOpenImportDialog}
          disabled={isImporting}
          variant='outline'
          className='flex w-full cursor-pointer items-center justify-start gap-2'
        >
          <Upload size={16} />
          {isImporting
            ? t('options.importExport.importing')
            : t('options.importExport.import')}
        </Button>
      </div>

      <input
        type='file'
        ref={fileInputRef}
        accept='.json'
        onChange={handleFileChange}
        className='hidden'
      />

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className='flex max-h-[90vh] flex-col gap-3 p-4 sm:max-w-md'>
          <DialogHeader className='shrink-0'>
            <DialogTitle>{t('options.importExport.dialogTitle')}</DialogTitle>
            <DialogDescription className='text-left'>
              {t('options.importExport.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className='grow overflow-auto'>
            <div className='pr-4'>
              {/* マージオプションを追加 */}
              <div className='mb-4 flex items-center gap-x-2'>
                <Checkbox
                  id='merge-data'
                  checked={mergeData}
                  onCheckedChange={(checked) => setMergeData(checked === true)}
                />
                <Label htmlFor='merge-data' className='cursor-pointer'>
                  {t('options.importExport.merge')}
                </Label>
              </div>

              <div className='mb-4 text-muted-foreground text-sm'>
                <p>
                  {mergeData
                    ? t('options.importExport.mergeDescription')
                    : t('options.importExport.replaceDescription')}
                </p>
              </div>

              {/* ドラッグ&ドロップエリア */}
              <div
                {...getRootProps()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/20'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className='mx-auto mb-2 size-12 text-muted-foreground' />
                <p className='mb-1 font-medium text-sm'>
                  {isDragActive
                    ? t('options.importExport.dropActive')
                    : t('options.importExport.dropIdle')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t('options.importExport.selectFile')}
                </p>
              </div>

              <Alert
                variant={mergeData ? 'default' : 'destructive'}
                className='my-4'
              >
                <AlertCircle className='size-4' />
                <AlertTitle>
                  {mergeData
                    ? t('options.importExport.mergeLabel')
                    : t('options.importExport.replaceLabel')}
                </AlertTitle>
                <AlertDescription>
                  {mergeData
                    ? t('options.importExport.mergeWarning')
                    : t('options.importExport.replaceWarning')}
                </AlertDescription>
              </Alert>
            </div>
          </ScrollArea>
          <DialogFooter className='flex shrink-0 flex-col gap-2 sm:flex-row sm:justify-between'>
            <Button
              variant='secondary'
              onClick={() => setImportDialogOpen(false)}
              disabled={isImporting}
              className='w-full cursor-pointer'
            >
              {t('options.importExport.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

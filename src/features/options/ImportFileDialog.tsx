import { AlertCircle, Upload } from 'lucide-react'
import { useCallback, useReducer, useRef, useState } from 'react'
import type { Dispatch } from 'react'
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
  getImportPreview,
  importSettings,
} from '@/features/options/lib/import-export'

const shouldCloseImportDialog = (open: boolean): boolean => !open
const createImportDialogOpenChangeHandler =
  ({
    close,
    resetFileInput,
  }: {
    close: () => void
    resetFileInput: () => void
  }) =>
  (open: boolean): void => {
    if (shouldCloseImportDialog(open)) {
      close()
      resetFileInput()
    }
  }
const createCloseImportDialogAction =
  (dispatchImportDialog: Dispatch<ImportDialogAction>) => (): void => {
    dispatchImportDialog({ type: 'CLOSE' })
  }
const resetImportFileInput = (fileInput: HTMLInputElement | null): void => {
  if (fileInput) {
    fileInput.value = ''
  }
}

interface PreviewData {
  version: string
  timestamp: string
  categoriesCount: number
  domainsCount: number
  projectsCount: number
  hasAiChat: boolean
  hasAnalytics: boolean
}

interface ImportDialogState {
  isOpen: boolean
  step: 'select' | 'preview'
  previewData: PreviewData | null
  mergeData: boolean
}

type ImportDialogAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'RESET' }
  | { type: 'SET_PREVIEW'; preview: PreviewData }
  | { type: 'SET_MERGE'; mergeData: boolean }

const initialImportDialogState: ImportDialogState = {
  isOpen: false,
  step: 'select',
  previewData: null,
  mergeData: true,
}

const importDialogReducer = (
  state: ImportDialogState,
  action: ImportDialogAction,
): ImportDialogState => {
  switch (action.type) {
    case 'OPEN': {
      return { ...state, isOpen: true, step: 'select', previewData: null }
    }
    case 'CLOSE': {
      return initialImportDialogState
    }
    case 'RESET': {
      return { ...state, step: 'select', previewData: null }
    }
    case 'SET_PREVIEW': {
      return { ...state, previewData: action.preview, step: 'preview' }
    }
    case 'SET_MERGE': {
      return { ...state, mergeData: action.mergeData }
    }
    default: {
      return state
    }
  }
}

interface ImportSelectStepProps {
  mergeData: boolean
  onMergeChange: (mergeData: boolean) => void
  isDragActive: boolean
  getRootProps: () => React.HTMLAttributes<HTMLDivElement>
  getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>
}

const ImportSelectStep: React.FC<ImportSelectStepProps> = ({
  mergeData,
  onMergeChange,
  isDragActive,
  getRootProps,
  getInputProps,
}) => {
  const { t } = useI18n()

  return (
    <>
      <div className='mb-4 flex items-center gap-x-2'>
        <Checkbox
          id='merge-data'
          checked={mergeData}
          onCheckedChange={(checked) => {
            onMergeChange(checked === true)
          }}
        />
        <Label htmlFor='merge-data' className='cursor-pointer'>
          {t('options.importExport.merge')}
        </Label>
      </div>

      <div className='mb-4 text-sm text-muted-foreground'>
        <p>
          {mergeData
            ? t('options.importExport.mergeDescription')
            : t('options.importExport.replaceDescription')}
        </p>
      </div>

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
        <p className='mb-1 text-sm font-medium'>
          {isDragActive
            ? t('options.importExport.dropActive')
            : t('options.importExport.dropIdle')}
        </p>
        <p className='text-xs text-muted-foreground'>
          {t('options.importExport.selectFile')}
        </p>
      </div>
    </>
  )
}

interface ImportPreviewStepProps {
  previewData: PreviewData
  mergeData: boolean
}

const ImportPreviewStep: React.FC<ImportPreviewStepProps> = ({
  previewData,
  mergeData,
}) => {
  const { t } = useI18n()

  return (
    <div className='space-y-4'>
      <div className='rounded-md bg-muted p-3 text-sm'>
        <div className='grid grid-cols-2 gap-x-4 gap-y-3'>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewVersionLabel')}
            </p>
            <p className='text-muted-foreground'>{previewData.version}</p>
          </div>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewTimestampLabel')}
            </p>
            <p className='text-muted-foreground'>
              {new Date(previewData.timestamp).toLocaleString()}
            </p>
          </div>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewCategoriesLabel')}
            </p>
            <p className='text-muted-foreground'>
              {previewData.categoriesCount}
            </p>
          </div>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewDomainsLabel')}
            </p>
            <p className='text-muted-foreground'>{previewData.domainsCount}</p>
          </div>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewProjectsLabel')}
            </p>
            <p className='text-muted-foreground'>{previewData.projectsCount}</p>
          </div>
          <div>
            <p className='font-medium'>
              {t('options.importExport.previewAiChatLabel')}
            </p>
            <p className='text-muted-foreground'>
              {previewData.hasAiChat ? t('common.yes') : t('common.no')}
            </p>
          </div>
        </div>
      </div>

      <Alert variant={mergeData ? 'default' : 'destructive'} className='my-4'>
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
  )
}

interface ImportFileDialogProps {
  onImportSuccess: () => Promise<void>
}

export const ImportFileDialog: React.FC<ImportFileDialogProps> = ({
  onImportSuccess,
}) => {
  const { t } = useI18n()
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importDialog, dispatchImportDialog] = useReducer(
    importDialogReducer,
    initialImportDialogState,
  )
  const selectedFileRef = useRef<File | null>(null)

  const handleOpenImportDialog = () => {
    dispatchImportDialog({ type: 'OPEN' })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    processFile(file)
  }

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.json')) {
        toast.error(t('options.importExport.invalidJson'))
        return
      }

      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          t('options.importExport.fileTooLarge', undefined, {
            maxSize: '10MB',
          }),
        )
        return
      }

      dispatchImportDialog({ type: 'OPEN' })
      selectedFileRef.current = file

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string
          if (!content) {
            toast.error(t('options.importExport.readError'))
            return
          }

          const result = getImportPreview(content)
          if (result.success && result.preview) {
            dispatchImportDialog({
              type: 'SET_PREVIEW',
              preview: result.preview,
            })
          } else {
            toast.error(result.message)
          }
        } catch (error) {
          console.error('プレビューエラー:', error)
          toast.error(t('options.importExport.readError'))
        }
      }

      reader.onerror = () => {
        toast.error(t('options.importExport.readError'))
      }

      reader.readAsText(file)
    },
    [t],
  )

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

  const resetFileInput = () => {
    selectedFileRef.current = null
    resetImportFileInput(fileInputRef.current)
  }

  const handleConfirmImport = async () => {
    setIsImporting(true)
    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string
          if (!content) {
            toast.error(t('options.importExport.readError'))
            return
          }

          const result = await importSettings(
            content,
            importDialog.mergeData,
            t,
          )
          if (result.success) {
            toast.success(result.message)
            dispatchImportDialog({ type: 'CLOSE' })
            selectedFileRef.current = null
            await onImportSuccess()
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
      }
      reader.readAsText(selectedFileRef.current!)
    } catch (error) {
      console.error('インポートエラー:', error)
      toast.error(t('options.importExport.importError'))
      setIsImporting(false)
    }
  }

  return (
    <>
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

      <input
        aria-label={t('options.importExport.import')}
        type='file'
        ref={fileInputRef}
        accept='.json'
        onChange={handleFileChange}
        className='hidden'
      />

      <Dialog
        open={importDialog.isOpen}
        onOpenChange={createImportDialogOpenChangeHandler({
          close: createCloseImportDialogAction(dispatchImportDialog),
          resetFileInput,
        })}
      >
        <DialogContent className='flex max-h-[90vh] flex-col gap-3 p-4 sm:max-w-md'>
          <DialogHeader className='shrink-0'>
            <DialogTitle>
              {importDialog.step === 'preview'
                ? t('options.importExport.previewTitle')
                : t('options.importExport.dialogTitle')}
            </DialogTitle>
            <DialogDescription className='text-left'>
              {importDialog.step === 'preview'
                ? t('options.importExport.previewDescription')
                : t('options.importExport.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className='grow overflow-auto'>
            <div className='pr-4'>
              {importDialog.step === 'select' && (
                <ImportSelectStep
                  mergeData={importDialog.mergeData}
                  onMergeChange={(mergeData) => {
                    dispatchImportDialog({ type: 'SET_MERGE', mergeData })
                  }}
                  isDragActive={isDragActive}
                  getRootProps={getRootProps}
                  getInputProps={getInputProps}
                />
              )}

              {importDialog.step === 'preview' && importDialog.previewData && (
                <ImportPreviewStep
                  previewData={importDialog.previewData}
                  mergeData={importDialog.mergeData}
                />
              )}
            </div>
          </ScrollArea>

          <DialogFooter className='flex shrink-0 flex-col gap-2 sm:flex-row sm:justify-end'>
            {importDialog.step === 'preview' && (
              <Button
                variant='outline'
                onClick={() => {
                  dispatchImportDialog({ type: 'RESET' })
                  resetFileInput()
                }}
                disabled={isImporting}
                className='w-full cursor-pointer sm:w-auto'
              >
                {t('options.importExport.back')}
              </Button>
            )}
            {importDialog.step === 'preview' && (
              <Button
                onClick={handleConfirmImport}
                disabled={isImporting}
                className='w-full cursor-pointer sm:w-auto'
              >
                {isImporting
                  ? t('options.importExport.importing')
                  : t('options.importExport.confirmImport')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export {
  createCloseImportDialogAction,
  createImportDialogOpenChangeHandler,
  importDialogReducer,
  initialImportDialogState,
  resetImportFileInput,
  shouldCloseImportDialog,
}

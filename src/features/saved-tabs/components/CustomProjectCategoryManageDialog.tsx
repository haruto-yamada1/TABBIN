import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'

interface CategoryManageDialogProps {
  category: string
  showManageDialog: boolean
  setShowManageDialog: (open: boolean) => void
  newCategoryName: string
  setNewCategoryName: (name: string) => void
  renameError: string | null
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (show: boolean) => void
  onRename: () => void
  onConfirmDelete: () => void
}

const shouldStopDialogPropagation = (key: string): boolean =>
  key === 'Enter' || key === ' '

const handleDialogKeyDown = (event: React.KeyboardEvent) => {
  if (shouldStopDialogPropagation(event.key)) {
    event.stopPropagation()
  }
}

export const CustomProjectCategoryManageDialog = ({
  category,
  showManageDialog,
  setShowManageDialog,
  newCategoryName,
  setNewCategoryName,
  renameError,
  showDeleteConfirm,
  setShowDeleteConfirm,
  onRename,
  onConfirmDelete,
}: CategoryManageDialogProps) => {
  const { t } = useI18n()

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleRenameInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    onRename()
  }

  return (
    <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
      <DialogContent
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={(event) => {
          event.stopPropagation()
        }}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{t('savedTabs.projectCategory.title')}</DialogTitle>
          <DialogDescription>
            {t('savedTabs.projectCategory.renameDescription', undefined, {
              name: category,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='gap-y-4'>
          <div>
            <Label htmlFor='rename-input'>
              {t('savedTabs.projectCategory.renameLabel')}
            </Label>
            <Input
              id='rename-input'
              value={newCategoryName}
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onChange={(event) => {
                setNewCategoryName(event.target.value)
              }}
              onBlur={onRename}
              placeholder={t('savedTabs.projectCategory.renamePlaceholder')}
              className={`w-full rounded border p-2 ${renameError ? 'border-red-500' : ''}`}
              onKeyDown={handleRenameInputKeyDown}
            />
            {renameError && (
              <p className='mt-1 text-xs text-red-500'>{renameError}</p>
            )}
          </div>

          <div className='border-t pt-4'>
            <p className='text-sm text-zinc-600'>
              {t('savedTabs.projectCategory.deleteWarning')}
            </p>
            {showDeleteConfirm ? (
              <div className='mt-2 flex justify-end gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                  onClick={() => {
                    setShowDeleteConfirm(false)
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={onConfirmDelete}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ) : (
              <div className='mt-2 flex justify-end'>
                <Button
                  variant='secondary'
                  size='sm'
                  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                  onClick={() => {
                    setShowDeleteConfirm(true)
                  }}
                >
                  {t('savedTabs.projectCategory.deleteAction')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

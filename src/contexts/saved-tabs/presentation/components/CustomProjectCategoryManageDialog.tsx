import { useCallback } from 'react'

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

type CategoryManageDialogProps = {
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

const RenameInputSection = ({
  newCategoryName,
  renameError,
  onNameChange,
  onBlur,
  onKeyDown,
}: {
  newCategoryName: string
  renameError: string | null
  onNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) => {
  const { t } = useI18n()

  return (
    <div>
      <Label htmlFor='rename-input'>
        {t('savedTabs.projectCategory.renameLabel')}
      </Label>
      <Input
        id='rename-input'
        value={newCategoryName}
        onChange={onNameChange}
        onBlur={onBlur}
        placeholder={t('savedTabs.projectCategory.renamePlaceholder')}
        className={`w-full rounded border p-2 ${renameError ? 'border-red-500' : ''}`}
        onKeyDown={onKeyDown}
      />
      {renameError && (
        <p className='mt-1 text-xs text-red-500'>{renameError}</p>
      )}
    </div>
  )
}

const DeleteSection = ({
  showDeleteConfirm,
  onCancelDelete,
  onConfirmDelete,
  onShowDelete,
}: {
  showDeleteConfirm: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onShowDelete: () => void
}) => {
  const { t } = useI18n()

  return (
    <div className='border-t pt-4'>
      <p className='text-sm text-zinc-600'>
        {t('savedTabs.projectCategory.deleteWarning')}
      </p>
      {showDeleteConfirm ? (
        <div className='mt-2 flex justify-end gap-2'>
          <Button variant='ghost' size='sm' onClick={onCancelDelete}>
            {t('common.cancel')}
          </Button>
          <Button variant='destructive' size='sm' onClick={onConfirmDelete}>
            {t('common.delete')}
          </Button>
        </div>
      ) : (
        <div className='mt-2 flex justify-end'>
          <Button variant='secondary' size='sm' onClick={onShowDelete}>
            {t('savedTabs.projectCategory.deleteAction')}
          </Button>
        </div>
      )}
    </div>
  )
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

  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return
      }
      event.preventDefault()
      onRename()
    },
    [onRename],
  )

  const handleContentClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
  }, [])

  const handleContentPointerDown = useCallback((event: React.PointerEvent) => {
    event.stopPropagation()
  }, [])

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNewCategoryName(event.target.value)
    },
    [setNewCategoryName],
  )

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [setShowDeleteConfirm])

  const handleShowDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [setShowDeleteConfirm])

  return (
    <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
      <DialogContent
        onClick={handleContentClick}
        onPointerDown={handleContentPointerDown}
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
          <RenameInputSection
            newCategoryName={newCategoryName}
            renameError={renameError}
            onNameChange={handleNameChange}
            onBlur={onRename}
            onKeyDown={handleRenameInputKeyDown}
          />
          <DeleteSection
            showDeleteConfirm={showDeleteConfirm}
            onCancelDelete={handleCancelDelete}
            onConfirmDelete={onConfirmDelete}
            onShowDelete={handleShowDeleteClick}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

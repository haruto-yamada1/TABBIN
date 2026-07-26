import { useCallback } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { OpenAllTabsConfirmDialog } from './shared/OpenAllTabsConfirmDialog'

type CategoryBulkConfirmDialogsProps = {
  isOpenAllConfirmOpen: boolean
  setIsOpenAllConfirmOpen: (open: boolean) => void
  isDeleteAllConfirmOpen: boolean
  setIsDeleteAllConfirmOpen: (open: boolean) => void
  categoryDisplayName: string
  onConfirmOpenAll: () => void
  onConfirmDeleteAll: () => void
}

export const CustomProjectCategoryBulkConfirmDialogs = ({
  isOpenAllConfirmOpen,
  setIsOpenAllConfirmOpen,
  isDeleteAllConfirmOpen,
  setIsDeleteAllConfirmOpen,
  categoryDisplayName,
  onConfirmOpenAll,
  onConfirmDeleteAll,
}: CategoryBulkConfirmDialogsProps) => {
  const { t } = useI18n()

  const handleConfirmDeleteAll = useCallback(() => {
    onConfirmDeleteAll()
  }, [onConfirmDeleteAll])

  return (
    <>
      <OpenAllTabsConfirmDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
        title={t('savedTabs.openAllConfirmTitle')}
        description={t('savedTabs.openAllConfirmDescription', undefined, {
          count: '10',
        })}
        cancelLabel={t('common.cancel')}
        openLabel={t('common.open')}
        onConfirm={onConfirmOpenAll}
      />

      <AlertDialog
        open={isDeleteAllConfirmOpen}
        onOpenChange={setIsDeleteAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.deleteAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.projectCategory.deleteAllWarning', undefined, {
                categoryName: categoryDisplayName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleConfirmDeleteAll}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

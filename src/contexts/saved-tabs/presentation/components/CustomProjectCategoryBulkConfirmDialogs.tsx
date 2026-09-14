import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ActionConfirmDialog } from './shared/ActionConfirmDialog'
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

      <ActionConfirmDialog
        open={isDeleteAllConfirmOpen}
        onOpenChange={setIsDeleteAllConfirmOpen}
        title={t('savedTabs.deleteAllConfirmTitle')}
        description={t(
          'savedTabs.projectCategory.deleteAllWarning',
          undefined,
          {
            categoryName: categoryDisplayName,
          },
        )}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        variant='destructive'
        onConfirm={onConfirmDeleteAll}
      />
    </>
  )
}

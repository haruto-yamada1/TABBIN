import { Trash } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { SavedTabsResponsiveLabel } from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryModalContext } from './CategoryModalContext'

/**
 * 親カテゴリの削除確認UI
 * 削除確認モード中のみ表示される
 */
export const CategoryDeleteConfirm = () => {
  const { t } = useI18n()
  const { state } = useCategoryModalContext()
  const { deletion, isLoading } = state

  const handleCancelClick = useCallback(() => {
    deletion.setShowDeleteConfirm(false)
  }, [deletion])

  if (!(deletion.showDeleteConfirm && deletion.categoryToDelete)) {
    return null
  }

  return (
    <div className='mt-2 mb-3 rounded border p-3'>
      <p className='mb-2 text-zinc-700 dark:text-zinc-300'>
        {t('savedTabs.categoryModal.deleteConfirmDescription', undefined, {
          name: deletion.categoryToDelete.name,
        })}
        {deletion.categoryToDelete.domainNames.length > 0 ? (
          <span className='mt-1 block text-xs'>
            {t('savedTabs.categoryModal.deleteConfirmDomains', undefined, {
              count: String(deletion.categoryToDelete.domainNames.length),
            })}
          </span>
        ) : null}
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleCancelClick}
          disabled={isLoading}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant='destructive'
          size='sm'
          // eslint-disable-next-line typescript/no-misused-promises
          onClick={deletion.handleDeleteCategory}
          disabled={isLoading}
          className='flex items-center gap-1'
        >
          <Trash size={14} />
          <SavedTabsResponsiveLabel>
            {t('common.delete')}
          </SavedTabsResponsiveLabel>
        </Button>
      </div>
    </div>
  )
}

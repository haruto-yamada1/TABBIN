import { Trash } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { SavedTabsResponsiveLabel } from '../shared/SavedTabsResponsive'
import { useKeywordModal } from './KeywordModalContext'

/**
 * 子カテゴリの削除確認UI
 * 削除確認モード中のみ表示される
 */
export const SubCategoryDeleteConfirm = () => {
  const { t } = useI18n()
  const { state } = useKeywordModal()
  const { subcategory, deletion } = state

  if (!deletion.showDeleteConfirm) {
    return null
  }

  return (
    <div className='mt-2 mb-3 rounded border p-3'>
      <p className='mb-2 text-zinc-300'>
        {t('savedTabs.subCategory.deleteConfirmTitle', undefined, {
          name: subcategory.activeCategory,
        })}
        <br />
        <span className='text-xs'>
          {t('savedTabs.subCategory.deleteConfirmHint')}
        </span>
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          variant='ghost'
          size='sm'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={() => {
            deletion.setShowDeleteConfirm(false)
          }}
          className='cursor-pointer rounded px-2 py-1'
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant='destructive'
          size='sm'
// eslint-disable-next-line typescript/no-misused-promises
          onClick={deletion.handleDeleteCategory}
          className='flex cursor-pointer items-center gap-1'
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

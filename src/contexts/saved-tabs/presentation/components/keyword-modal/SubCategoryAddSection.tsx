import { useCallback } from 'react'

import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useKeywordModal } from './KeywordModalContext'

/**
 * 新しい子カテゴリを追加するセクション
 */
export const SubCategoryAddSection = () => {
  const { t } = useI18n()
  const { state } = useKeywordModal()
  const { subcategory } = state

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void subcategory.handleAddSubCategory()
      }
    },
    [subcategory],
  )

  const handleBlur = useCallback(() => {
    if (subcategory.newSubCategory.trim()) {
      void subcategory.handleAddSubCategory()
    }
  }, [subcategory])

  return (
    <div className='mb-4'>
      <h4 className='text-md mb-2 font-medium text-zinc-300'>
        {t('savedTabs.subCategory.addTitle')}
      </h4>
      <div className='flex flex-col'>
        <Input
          value={subcategory.newSubCategory}
          onChange={subcategory.handleSubCategoryNameChange}
          placeholder={t('savedTabs.subCategory.addPlaceholder')}
          className={`grow rounded border p-2 ${subcategory.subCategoryNameError ? 'border-red-500' : ''}`}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        {subcategory.subCategoryNameError && (
          <p className='mt-1 text-xs text-red-500'>
            {subcategory.subCategoryNameError}
          </p>
        )}
      </div>
    </div>
  )
}

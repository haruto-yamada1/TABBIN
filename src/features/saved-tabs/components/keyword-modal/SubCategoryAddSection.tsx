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

  return (
    <div className='mb-4'>
      <h4 className='mb-2 font-medium text-md text-zinc-300'>
        {t('savedTabs.subCategory.addTitle')}
      </h4>
      <div className='flex flex-col'>
        <Input
          value={subcategory.newSubCategory}
          onChange={subcategory.handleSubCategoryNameChange}
          placeholder={t('savedTabs.subCategory.addPlaceholder')}
          className={`grow rounded border p-2 ${subcategory.subCategoryNameError ? 'border-red-500' : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              subcategory.handleAddSubCategory()
            }
          }}
          onBlur={() => {
            if (subcategory.newSubCategory.trim()) {
              subcategory.handleAddSubCategory()
            }
          }}
        />
        {subcategory.subCategoryNameError && (
          <p className='mt-1 text-red-500 text-xs'>
            {subcategory.subCategoryNameError}
          </p>
        )}
      </div>
    </div>
  )
}

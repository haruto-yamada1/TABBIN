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
      <h4 className='text-md mb-2 font-medium text-zinc-300'>
        {t('savedTabs.subCategory.addTitle')}
      </h4>
      <div className='flex flex-col'>
        <Input
          value={subcategory.newSubCategory}
          onChange={subcategory.handleSubCategoryNameChange}
          placeholder={t('savedTabs.subCategory.addPlaceholder')}
          className={`grow rounded border p-2 ${subcategory.subCategoryNameError ? 'border-red-500' : ''}`}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
// eslint-disable-next-line typescript/no-floating-promises
              subcategory.handleAddSubCategory()
            }
          }}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onBlur={() => {
            if (subcategory.newSubCategory.trim()) {
// eslint-disable-next-line typescript/no-floating-promises
              subcategory.handleAddSubCategory()
            }
          }}
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

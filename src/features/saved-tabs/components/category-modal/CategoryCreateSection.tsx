import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryModalContext } from './CategoryModalContext'

/**
 * 新規カテゴリ作成セクション
 */
export const CategoryCreateSection = () => {
  const { t } = useI18n()
  const { state } = useCategoryModalContext()
  const { create } = state

  return (
    <div>
      <Label htmlFor='newCategory' className='mb-2'>
        {t('savedTabs.categoryModal.createLabel')}
      </Label>
      <Input
        id='newCategory'
        value={create.newCategoryName}
        onChange={create.handleCategoryNameChange}
        onKeyDown={create.handleKeyDown}
        onBlur={create.handleBlur}
        placeholder={t('savedTabs.categoryModal.placeholder')}
        className={create.nameError ? 'border-red-500' : ''}
      />
      {create.nameError && (
        <p className='mt-1 text-xs text-red-500'>{create.nameError}</p>
      )}
    </div>
  )
}

import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryModalContext } from './CategoryModalContext'

/**
 * 新規カテゴリ作成セクション
 * 作成後にドメイン割当へ進む流れの説明と、明示的な作成ボタンを添える
 * (issue #1130)。作成自体は従来どおり Enter / フォーカスアウトでも行える。
 */
export const CategoryCreateSection = () => {
  const { t } = useI18n()
  const { state } = useCategoryModalContext()
  const { create, isLoading } = state

  // ボタンの mousedown で入力欄の blur が先に走ると二重作成になるため、
  // blur を抑止して click 側の作成だけを実行する。
  const handleCreateButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
    },
    [],
  )
  const handleCreateButtonClick = useCallback(() => {
    void create.handleCreateCategory()
  }, [create])

  const isCreateDisabled =
    isLoading || !create.newCategoryName.trim() || Boolean(create.nameError)

  return (
    <div>
      <Label htmlFor='newCategory' className='mb-2'>
        {t('savedTabs.categoryModal.createLabel')}
      </Label>
      <div className='flex gap-2'>
        <Input
          id='newCategory'
          data-tour='academy-parent-create'
          value={create.newCategoryName}
          onChange={create.handleCategoryNameChange}
          onKeyDown={create.handleKeyDown}
          onBlur={create.handleBlur}
          placeholder={t('savedTabs.categoryModal.placeholder')}
          className={create.nameError ? 'border-red-500' : ''}
        />
        <Button
          type='button'
          className='shrink-0 cursor-pointer'
          disabled={isCreateDisabled}
          onMouseDown={handleCreateButtonMouseDown}
          onClick={handleCreateButtonClick}
        >
          {t('savedTabs.categoryModal.createAction')}
        </Button>
      </div>
      {create.nameError && (
        <p className='mt-1 text-xs text-red-500'>{create.nameError}</p>
      )}
      <p className='mt-2 text-sm text-muted-foreground'>
        {t('savedTabs.categoryModal.createGuide')}
      </p>
    </div>
  )
}

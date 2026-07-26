import { useCallback, useEffect, useRef } from 'react'

import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useKeywordModal } from './KeywordModalContext'

/**
 * 子カテゴリのリネームフォーム
 * リネームモード中のみ表示される
 */
export const SubCategoryRenameForm = () => {
  const { t } = useI18n()
  const { state } = useKeywordModal()
  const { subcategory, rename } = state
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (rename.isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [rename.isRenaming])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.currentTarget.blur()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        rename.handleCancelRenaming()
      }
    },
    [rename],
  )

  if (!rename.isRenaming) {
    return null
  }

  return (
    <div className='mt-2 mb-3 rounded border p-3'>
      <div className='mb-2 text-sm text-zinc-300'>
        {t('savedTabs.subCategory.renamePrompt', undefined, {
          name: subcategory.activeCategory,
        })}
        <br />
        <span className='text-xs text-zinc-400'>
          {t('savedTabs.subCategory.renameHint')}
        </span>
      </div>
      <Input
        ref={renameInputRef}
        value={rename.newCategoryName}
        onChange={rename.handleRenameCategoryNameChange}
        placeholder={t('savedTabs.subCategory.addPlaceholder')}
        className={`w-full rounded border p-2 ${rename.categoryRenameError ? 'border-red-500' : ''}`}
        data-rename-input='true'
        // eslint-disable-next-line typescript/no-misused-promises
        onBlur={rename.handleSaveRenaming}
        onKeyDown={handleKeyDown}
      />
      {rename.categoryRenameError && (
        <p className='mt-1 text-xs text-red-500'>
          {rename.categoryRenameError}
        </p>
      )}
    </div>
  )
}

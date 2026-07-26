import { X } from 'lucide-react'
import { useCallback } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useKeywordModal } from './KeywordModalContext'

type KeywordBadgeProps = {
  keyword: string
  onRemove: (keyword: string) => Promise<void>
  isDisabled: boolean
  deleteAriaLabel: string
}

const KeywordBadge = ({
  keyword,
  onRemove,
  isDisabled,
  deleteAriaLabel,
}: KeywordBadgeProps) => {
  const handleRemove = useCallback(() => {
    void onRemove(keyword)
  }, [onRemove, keyword])

  return (
    <Badge
      variant='outline'
      className='flex items-center gap-1 rounded px-2 py-1'
    >
      {keyword}
      <Button
        variant='ghost'
        size='sm'
        onClick={handleRemove}
        className='ml-1 cursor-pointer text-zinc-400 hover:text-zinc-200'
        aria-label={deleteAriaLabel}
        disabled={isDisabled}
      >
        <X size={14} />
      </Button>
    </Badge>
  )
}

/**
 * キーワード設定セクション
 * キーワードの追加・削除を行う
 */
export const KeywordEditor = () => {
  const { t } = useI18n()
  const { state, group } = useKeywordModal()
  const { subcategory, keywords: keywordsState, rename } = state

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      keywordsState.setNewKeyword(e.target.value)
    },
    [keywordsState],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        keywordsState.handleAddKeyword()
      }
    },
    [keywordsState],
  )

  const handleBlur = useCallback(() => {
    if (keywordsState.newKeyword.trim()) {
      keywordsState.handleAddKeyword()
    }
  }, [keywordsState])

  if (!group.subCategories || group.subCategories.length === 0) {
    return null
  }

  return (
    <div className='mb-4'>
      <Label htmlFor='keyword-input' className='block text-sm text-zinc-400'>
        {t('savedTabs.keywords.activeCategoryLabel', undefined, {
          name: subcategory.activeCategory,
        })}
      </Label>
      <span className='mb-1 text-xs text-zinc-500'>
        {t('savedTabs.keywords.autoAssignHint')}
      </span>

      <div className='my-2 flex'>
        <Input
          id='keyword-input'
          value={keywordsState.newKeyword}
          onChange={handleChange}
          placeholder={t('savedTabs.keywords.placeholder')}
          className='grow rounded border p-2'
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={rename.isRenaming}
        />
      </div>

      <div className='flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded border p-2'>
        {keywordsState.keywords.length === 0 ? (
          <p className='text-zinc-500'>{t('savedTabs.keywords.empty')}</p>
        ) : (
          keywordsState.keywords.map((keyword) => (
            <KeywordBadge
              key={keyword}
              keyword={keyword}
              onRemove={keywordsState.handleRemoveKeyword}
              isDisabled={rename.isRenaming}
              deleteAriaLabel={t('savedTabs.keywords.deleteAria')}
            />
          ))
        )}
      </div>
    </div>
  )
}

import { Edit, Trash2 } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '../shared/SavedTabsResponsive'
import { useKeywordModal } from './KeywordModalContext'
import { SubCategoryDeleteConfirm } from './SubCategoryDeleteConfirm'
import { SubCategoryRenameForm } from './SubCategoryRenameForm'

/** Rename button — extracted to fix jsx-max-depth */
const RenameSubCategoryButton = () => {
  const { t } = useI18n()
  const { state } = useKeywordModal()
  const { subcategory, rename } = state

  if (rename.isRenaming) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onClick={rename.handleStartRenaming}
          className='flex cursor-pointer items-center gap-1 rounded px-2 py-1'
          disabled={!subcategory.activeCategory}
        >
          <Edit size={14} />
          <SavedTabsResponsiveLabel>
            {t('savedTabs.subCategory.rename')}
          </SavedTabsResponsiveLabel>
        </Button>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {t('savedTabs.subCategory.rename')}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  )
}

/** Delete button — extracted to fix jsx-max-depth */
const DeleteSubCategoryButton = () => {
  const { t } = useI18n()
  const { state } = useKeywordModal()
  const { subcategory, deletion } = state

  const handleShowDelete = useCallback(() => {
    deletion.setShowDeleteConfirm(true)
  }, [deletion])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onClick={handleShowDelete}
          className='flex cursor-pointer items-center gap-1 rounded px-2 py-1'
          disabled={!subcategory.activeCategory}
        >
          <Trash2 size={14} />
          <SavedTabsResponsiveLabel>
            {t('savedTabs.subCategory.deleteSelected')}
          </SavedTabsResponsiveLabel>
        </Button>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {t('savedTabs.subCategory.deleteSelected')}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  )
}

/**
 * 既存の子カテゴリを選択・管理するセクション
 * セレクタ、リネーム、削除確認を含む
 */
export const SubCategorySelector = () => {
  const { t } = useI18n()
  const { state, group } = useKeywordModal()
  const { subcategory, rename } = state

  if (!group.subCategories || group.subCategories.length === 0) {
    return null
  }

  return (
    <div className='mb-4'>
      <div className='mb-2 flex items-center justify-between'>
        <Label htmlFor='category-select'>
          {t('savedTabs.subCategory.selectLabel')}
        </Label>

        <div className='flex gap-2'>
          <RenameSubCategoryButton />
          <DeleteSubCategoryButton />
        </div>
      </div>

      <SubCategoryRenameForm />
      <SubCategoryDeleteConfirm />

      <Select
        value={subcategory.activeCategory}
        // eslint-disable-next-line react/jsx-handler-names
        onValueChange={subcategory.setActiveCategory}
        disabled={rename.isRenaming}
      >
        <SelectTrigger className='w-full rounded border p-2'>
          <SelectValue
            placeholder={t('savedTabs.subCategory.selectPlaceholder')}
          />
        </SelectTrigger>
        <SelectContent>
          {group.subCategories.map((cat) => (
            <SelectItem key={cat} value={cat} className='cursor-pointer'>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

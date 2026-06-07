import { Trash2 } from 'lucide-react'

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
import { CategoryDeleteConfirm } from './CategoryDeleteConfirm'
import { useCategoryModalContext } from './CategoryModalContext'

/**
 * カテゴリ選択セクション
 * セレクタと削除確認UIを含む
 */
export const CategorySelector = () => {
  const { t } = useI18n()
  const { state } = useCategoryModalContext()
  const { selection, deletion, isLoading } = state

  if (selection.categories.length === 0) {
    return null
  }

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <Label htmlFor='categorySelect'>
          {t('savedTabs.categoryModal.selectLabel')}
        </Label>
        {selection.categories.length > 0 &&
          selection.selectedCategoryId &&
          selection.selectedCategoryId !== 'uncategorized' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={deletion.handleDeleteClick}
                  disabled={isLoading}
                  className='cursor-pointer'
                >
                  <Trash2 size={16} />
                  <SavedTabsResponsiveLabel>
                    {t('savedTabs.categoryModal.deleteSelected')}
                  </SavedTabsResponsiveLabel>
                </Button>
              </TooltipTrigger>
              <SavedTabsResponsiveTooltipContent side='top'>
                {t('savedTabs.categoryModal.deleteSelected')}
              </SavedTabsResponsiveTooltipContent>
            </Tooltip>
          )}
      </div>
      <Select
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        value={selection.selectedCategoryId || ''}
        onValueChange={selection.handleCategoryChange}
      >
        <SelectTrigger className='w-full' id='categorySelect'>
          <SelectValue
            placeholder={t('savedTabs.categoryModal.selectPlaceholder')}
          />
        </SelectTrigger>
        <SelectContent>
          {selection.categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CategoryDeleteConfirm />
    </div>
  )
}

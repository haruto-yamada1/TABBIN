import { memo, useMemo } from 'react'

import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import type { CategoryGroupProps } from '@/types/saved-tabs'

import { CategoryGroupActions } from './category-group/CategoryGroupActions'
import { CategoryGroupContent } from './category-group/CategoryGroupContent'
import {
  CategoryGroupCollapseControl,
  CategoryGroupReorderControl,
  CategoryGroupSortControl,
} from './category-group/CategoryGroupControls'
import { CategoryGroupHeader } from './category-group/CategoryGroupHeader'
import { CategoryGroupRoot } from './category-group/CategoryGroupRoot'
import { CategoryGroupTitle } from './category-group/CategoryGroupTitle'

/**
 * 親カテゴリグループコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CategoryGroupProps
 */
const CategoryGroupComponent = ({
  category,
  domains,
  handleOpenAllTabs,
  handleDeleteGroup,
  handleDeleteGroups,
  handleDeleteUrl,
  handleDeleteUrls,
  handleOpenTab,
  handleUpdateUrls,
  handleUpdateDomainsOrder,
  handleMoveDomainToCategory,
  handleDeleteCategory,
  settings,
  isCategoryReorderMode = false,
  searchQuery = '',
  reorderTabGroupUrlsUseCase,
}: CategoryGroupProps & {
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase: ReorderTabGroupUrlsUseCase
}) => {
  const handlers = useMemo(
    () => ({
      handleDeleteCategory,
      handleDeleteGroup,
      handleDeleteGroups,
      handleDeleteUrl,
      handleDeleteUrls,
      handleMoveDomainToCategory,
      handleOpenAllTabs,
      handleOpenTab,
      handleUpdateDomainsOrder,
      handleUpdateUrls,
    }),
    [
      handleOpenAllTabs,
      handleDeleteGroup,
      handleDeleteGroups,
      handleDeleteUrl,
      handleDeleteUrls,
      handleOpenTab,
      handleUpdateUrls,
      handleUpdateDomainsOrder,
      handleMoveDomainToCategory,
      handleDeleteCategory,
    ],
  )

  return (
    <CategoryGroupRoot
      category={category}
      domains={domains}
      settings={settings}
      isCategoryReorderMode={isCategoryReorderMode}
      searchQuery={searchQuery}
      handlers={handlers}
      reorderTabGroupUrlsUseCase={reorderTabGroupUrlsUseCase}
    >
      <CategoryGroupHeader>
        <div className='flex grow items-center gap-2'>
          <CategoryGroupCollapseControl />
          <CategoryGroupSortControl />
          <CategoryGroupTitle />
        </div>
        <CategoryGroupReorderControl />
        <CategoryGroupActions />
      </CategoryGroupHeader>
      <CategoryGroupContent />
    </CategoryGroupRoot>
  )
}

export const CategoryGroup = memo(CategoryGroupComponent)

import type { useSortable } from '@dnd-kit/sortable'

import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import type { useCategoryGroupState } from '@/contexts/saved-tabs/presentation/hooks/useCategoryGroupState'
import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { CategoryGroupProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'

/** CategoryGroup のコンテキスト型 */
export type CategoryGroupContextType = {
  /** フック戻り値 */
  state: ReturnType<typeof useCategoryGroupState>
  /** 親カテゴリデータ */
  category: CategoryGroupProps['category']
  /** ドメイングループ配列 */
  domains: CategoryGroupProps['domains']
  /** 設定 */
  settings: UserSettingsDto
  /** 親カテゴリ並び替えモード */
  isCategoryReorderMode: boolean
  /** 検索クエリ */
  searchQuery: string
  /** 表示可能なドメイン数 */
  visibleDomainsCount: number
  /** 全URL */
  allUrls: CategoryGroupProps['domains'][number]['urls']
  /** ソート可能な属性・リスナー */
  sortable: Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>
  /** 操作ハンドラ */
  handlers: {
    handleOpenAllTabs: CategoryGroupProps['handleOpenAllTabs']
    handleDeleteGroup: CategoryGroupProps['handleDeleteGroup']
    handleDeleteGroups?: CategoryGroupProps['handleDeleteGroups']
    handleDeleteUrl: CategoryGroupProps['handleDeleteUrl']
    handleDeleteUrls?: CategoryGroupProps['handleDeleteUrls']
    handleOpenTab: CategoryGroupProps['handleOpenTab']
    handleUpdateUrls: CategoryGroupProps['handleUpdateUrls']
    handleUpdateDomainsOrder: CategoryGroupProps['handleUpdateDomainsOrder']
    handleMoveDomainToCategory: CategoryGroupProps['handleMoveDomainToCategory']
    handleDeleteCategory: CategoryGroupProps['handleDeleteCategory']
  }
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase: ReorderTabGroupUrlsUseCase
}

export const {
  context: CategoryGroupContext,
  useCompoundContext: useCategoryGroup,
} = createCompoundContext<CategoryGroupContextType>('CategoryGroup')

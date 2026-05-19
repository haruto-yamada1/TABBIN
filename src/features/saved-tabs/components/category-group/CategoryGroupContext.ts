import type { useSortable } from '@dnd-kit/sortable'

import { createCompoundContext } from '@/lib/ui/createCompoundContext'
import type { CategoryGroupProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

import type { useCategoryGroupState } from '../../hooks/useCategoryGroupState'

/** CategoryGroup のコンテキスト型 */
export interface CategoryGroupContextType {
  /** フック戻り値 */
  state: ReturnType<typeof useCategoryGroupState>
  /** 親カテゴリデータ */
  category: CategoryGroupProps['category']
  /** ドメイングループ配列 */
  domains: CategoryGroupProps['domains']
  /** 設定 */
  settings: UserSettings
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
}

export const {
  context: CategoryGroupContext,
  useCompoundContext: useCategoryGroup,
} = createCompoundContext<CategoryGroupContextType>('CategoryGroup')

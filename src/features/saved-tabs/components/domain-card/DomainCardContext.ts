import type { useSortable } from '@dnd-kit/sortable'

import { createCompoundContext } from '@/lib/ui/createCompoundContext'
import type { SortableDomainCardProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

import type { useDomainCardState } from '../../hooks/useDomainCardState'

/** DomainCard のコンテキスト型 */
export interface DomainCardContextType {
  /** フック戻り値 */
  state: ReturnType<typeof useDomainCardState>
  /** タブグループデータ */
  group: SortableDomainCardProps['group']
  /** 設定 */
  settings: UserSettings
  /** 親カテゴリID */
  categoryId?: string
  /** 検索クエリ */
  searchQuery: string
  /** 表示中の子カテゴリ数 */
  visibleSubCategoryCount: number
  /** 並び替えモード状態 */
  isReorderMode: boolean
  /** ソート可能な属性・リスナー */
  sortable: Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>
  /** 操作ハンドラ */
  handlers: {
    handleOpenAllTabs: SortableDomainCardProps['handleOpenAllTabs']
    handleDeleteGroup: SortableDomainCardProps['handleDeleteGroup']
    handleDeleteGroups?: SortableDomainCardProps['handleDeleteGroups']
    handleDeleteUrl: SortableDomainCardProps['handleDeleteUrl']
    handleDeleteUrls?: SortableDomainCardProps['handleDeleteUrls']
    handleOpenTab: SortableDomainCardProps['handleOpenTab']
    handleUpdateUrls: SortableDomainCardProps['handleUpdateUrls']
  }
}

export const { context: DomainCardContext, useCompoundContext: useDomainCard } =
  createCompoundContext<DomainCardContextType>('DomainCard')

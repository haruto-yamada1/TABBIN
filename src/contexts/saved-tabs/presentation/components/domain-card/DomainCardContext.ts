import type { useSortable } from '@dnd-kit/sortable'

import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import type { useDomainCardState } from '@/contexts/saved-tabs/presentation/hooks/useDomainCardState'
import type { SortableDomainCardProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'

/** DomainCard のコンテキスト型 */
export type DomainCardContextType = {
  /** フック戻り値 */
  state: ReturnType<typeof useDomainCardState>
  /** タブグループデータ */
  group: SortableDomainCardProps['group']
  /** 設定 */
  settings: UserSettingsDto
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
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase: ReorderTabGroupUrlsUseCase
}

export const { context: DomainCardContext, useCompoundContext: useDomainCard } =
  createCompoundContext<DomainCardContextType>('DomainCard')

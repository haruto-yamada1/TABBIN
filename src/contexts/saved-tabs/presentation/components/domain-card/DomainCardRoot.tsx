import { useDndMonitor } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { useDomainCardState } from '@/contexts/saved-tabs/presentation/hooks/useDomainCardState'
import type { SortableDomainCardProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'

import { DomainCardContext } from './DomainCardContext'
import type { DomainCardContextType } from './DomainCardContext'

/** DomainCardRoot の props */
interface DomainCardRootProps {
  /** タブグループデータ */
  group: SortableDomainCardProps['group']
  /** 設定 */
  settings: UserSettings
  /** 親カテゴリID */
  categoryId?: string
  /** 並び替えモード */
  isReorderMode?: boolean
  /** 検索クエリ */
  searchQuery?: string
  /** 操作ハンドラ */
  handlers: DomainCardContextType['handlers']
  /** カテゴリ削除ハンドラ */
  handleDeleteCategory?: (groupId: string, categoryName: string) => void
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase: DomainCardContextType['reorderTabGroupUrlsUseCase']
  /** 子コンポーネント */
  children: React.ReactNode
}

/**
 * DomainCard の複合コンポーネントルート
 * コンテキスト + useSortable + useDomainCardState を提供する
 * @param props DomainCardRootProps
 */
export const DomainCardRoot = ({
  group,
  settings,
  categoryId,
  isReorderMode = false,
  searchQuery = '',
  handlers,
  handleDeleteCategory,
  reorderTabGroupUrlsUseCase,
  children,
}: DomainCardRootProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: group.id })

  const state = useDomainCardState({
    group,
    handleDeleteCategory,
    handleDeleteUrls: handlers.handleDeleteUrls,
    isReorderMode,
  })

  // グローバルドラッグ監視
  useDndMonitor(state.dndMonitorHandlers)

  const style: CSSProperties = useMemo(
    () => ({
      containIntrinsicSize: '360px',
      contentVisibility: 'auto',
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  )

  // 検索でヒットしない場合は非表示
  const hasSearchQuery = searchQuery.trim().length > 0
  const totalUrls = group.urls?.length ?? 0
  const visibleSubCategoryCount = categoryId
    ? Object.entries(state.computed.categorizedUrls).filter(
        ([categoryName, urls]) =>
          categoryName !== '__uncategorized' && urls.length > 0,
      ).length
    : 0

  const contextValue: DomainCardContextType = useMemo(
    () => ({
      categoryId,
      group,
      handlers,
      isReorderMode,
      reorderTabGroupUrlsUseCase,
      searchQuery,
      settings,
      sortable: { attributes, listeners },
      state,
      visibleSubCategoryCount,
    }),
    [
      state,
      group,
      settings,
      categoryId,
      searchQuery,
      visibleSubCategoryCount,
      isReorderMode,
      attributes,
      listeners,
      handlers,
      reorderTabGroupUrlsUseCase,
    ],
  )

  if (hasSearchQuery && totalUrls === 0) {
    return null
  }

  return (
    <DomainCardContext value={contextValue}>
      <div
        ref={setNodeRef}
        style={style}
        className='shadow-md'
        data-category-id={categoryId}
        data-saved-tabs-scroll-target='domain'
        data-testid='domain-scroll-target'
        data-urls-count={group.urls?.length ?? 0}
      >
        {children}
      </div>
    </DomainCardContext>
  )
}

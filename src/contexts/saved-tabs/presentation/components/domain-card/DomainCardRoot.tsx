import { useDndMonitor } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { useSavedTabsUseCases } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { UrlReorderAvailabilityContext } from '@/contexts/saved-tabs/presentation/controllers/UrlReorderAvailabilityContext'
import { useDomainCardState } from '@/contexts/saved-tabs/presentation/hooks/useDomainCardState'
import { canReorderFavoriteDisplay } from '@/contexts/saved-tabs/presentation/lib/favorite-display'
import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { SortableDomainCardProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'

import { DomainCardContext } from './DomainCardContext'
import type { DomainCardContextType } from './DomainCardContext'

/** DomainCardRoot の props */
type DomainCardRootProps = {
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
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: group.id, data: { name: group.domain } })
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const displayGroup = useMemo(
    () =>
      favoritesOnly
        ? { ...group, urls: (group.urls ?? []).filter((url) => url.isFavorite) }
        : group,
    [group, favoritesOnly],
  )
  const hasFavorites = (group.urls ?? []).some((url) => url.isFavorite)
  const savedTabs = useSavedTabsUseCases()
  const categoryPersistence = useMemo(
    () =>
      savedTabs
        ? {
            categoryAssignmentPort: savedTabs.deps.categoryAssignmentPort,
            getSavedTabsPageDataQuery: savedTabs.useCases.getSavedTabsPageData,
          }
        : {},
    [savedTabs],
  )

  const state = useDomainCardState({
    group,
    ...categoryPersistence,
    ...(handleDeleteCategory !== undefined ? { handleDeleteCategory } : {}),
    ...(handlers.handleDeleteUrls !== undefined
      ? { handleDeleteUrls: handlers.handleDeleteUrls }
      : {}),
    isReorderMode,
  })

  const displayState = useMemo(
    () =>
      favoritesOnly
        ? {
            ...state,
            computed: {
              categorizedUrls: Object.fromEntries(
                Object.entries(state.computed.categorizedUrls).map(
                  ([category, urls]) => [
                    category,
                    urls.filter((url) => url.isFavorite),
                  ],
                ),
              ),
            },
          }
        : state,
    [state, favoritesOnly],
  )

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
    ? Object.entries(displayState.computed.categorizedUrls).filter(
        ([categoryName, urls]) =>
          categoryName !== '__uncategorized' && urls.length > 0,
      ).length
    : 0

  const contextValue: DomainCardContextType = useMemo(
    () => ({
      ...(categoryId !== undefined ? { categoryId } : {}),
      group: displayGroup,
      favoriteFilter: {
        only: favoritesOnly,
        setOnly: setFavoritesOnly,
        hasFavorites,
      },
      handlers,
      isReorderMode,
      reorderTabGroupUrlsUseCase,
      searchQuery,
      settings,
      sortable: { attributes, listeners, setActivatorNodeRef },
      state: displayState,
      visibleSubCategoryCount,
    }),
    [
      displayState,
      displayGroup,
      favoritesOnly,
      hasFavorites,
      settings,
      categoryId,
      searchQuery,
      visibleSubCategoryCount,
      isReorderMode,
      attributes,
      setActivatorNodeRef,
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
        <UrlReorderAvailabilityContext
          value={
            state.sort.sortOrder === 'default' &&
            !state.sort.isSortPending &&
            canReorderFavoriteDisplay(group.urls, favoritesOnly)
          }
        >
          {children}
        </UrlReorderAvailabilityContext>
      </div>
    </DomainCardContext>
  )
}

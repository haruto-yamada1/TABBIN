import { useDndMonitor } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo } from 'react'

import type { RenameParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameParentCategoryUseCase'
import type { UserSettingsDto as UserSettings } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type {
  CategoryManagementModalDeps,
  CategoryManagementModalUseCases,
} from '@/contexts/saved-tabs/presentation/components/CategoryManagementModal'
import { CategoryManagementModal } from '@/contexts/saved-tabs/presentation/components/CategoryManagementModal'
import { useCategoryGroupState } from '@/contexts/saved-tabs/presentation/hooks/useCategoryGroupState'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CategoryGroupProps } from '@/types/saved-tabs'

import { CategoryGroupContext } from './CategoryGroupContext'
import type { CategoryGroupContextType } from './CategoryGroupContext'

/** CategoryGroupRoot の props */
interface CategoryGroupRootProps {
  /** 親カテゴリデータ */
  category: CategoryGroupProps['category']
  /** ドメイングループ配列 */
  domains: CategoryGroupProps['domains']
  /** 設定 */
  settings: UserSettings
  /** 親カテゴリ並び替えモード */
  isCategoryReorderMode?: boolean
  /** 検索クエリ */
  searchQuery?: string
  /** 操作ハンドラ */
  handlers: CategoryGroupContextType['handlers']
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase: CategoryGroupContextType['reorderTabGroupUrlsUseCase']
  /**
   * 親カテゴリリネーム use-case。`chrome.storage.local` 直叩きの
   * 置換先（issue #502）。
   */
  renameParentCategoryUseCase: RenameParentCategoryUseCase
  /**
   * `CategoryManagementModal` の repository 群。`chrome.storage.local`
   * 直叩きを置換（issue #502）。context 経由でも解決可能だが、
   * テスト容易性のため props としても受け取る。
   */
  categoryManagementModalDeps: CategoryManagementModalDeps
  /**
   * `CategoryManagementModal` が直接実行する use-case 群。
   * 旧 `onCategoryUpdate` コールバックを置換（issue #502）。
   */
  categoryManagementModalUseCases: CategoryManagementModalUseCases
  /** 子コンポーネント */
  children: React.ReactNode
}

/**
 * CategoryGroup の複合コンポーネントルート
 * コンテキスト + useSortable + useCategoryGroupState を提供する
 * @param props CategoryGroupRootProps
 */
export const CategoryGroupRoot = ({
  category,
  domains,
  settings,
  isCategoryReorderMode = false,
  searchQuery = '',
  handlers,
  reorderTabGroupUrlsUseCase,
  renameParentCategoryUseCase,
  categoryManagementModalDeps,
  categoryManagementModalUseCases,
  children,
}: CategoryGroupRootProps) => {
  const { t } = useI18n()
  const state = useCategoryGroupState({
    category,
    domains,
    handleDeleteGroup: handlers.handleDeleteGroup,
    handleUpdateDomainsOrder: handlers.handleUpdateDomainsOrder,
    isCategoryReorderMode,
    renameParentCategoryUseCase,
  })

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: category.id })

  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // グローバルドラッグ監視
  useDndMonitor(state.dndMonitorHandlers)

  // このカテゴリ内のすべてのURLを取得
  const allUrls = domains.flatMap((group) => group.urls ?? [])

  // 検索でヒットしないカテゴリは非表示
  const hasSearchQuery = searchQuery.trim().length > 0
  const hasVisibleDomains = domains.some(
    (domain) => (domain.urls?.length ?? 0) > 0,
  )

  // 検索結果に応じたドメイン数を計算
  const visibleDomainsCount = hasSearchQuery
    ? domains.filter((domain) => (domain.urls?.length ?? 0) > 0).length
    : domains.length

  const contextValue: CategoryGroupContextType = useMemo(
    () => ({
      allUrls,
      category,
      domains,
      handlers,
      isCategoryReorderMode,
      reorderTabGroupUrlsUseCase,
      searchQuery,
      settings,
      sortable: { attributes, listeners },
      state,
      visibleDomainsCount,
    }),
    [
      state,
      category,
      domains,
      settings,
      isCategoryReorderMode,
      searchQuery,
      visibleDomainsCount,
      allUrls,
      attributes,
      listeners,
      handlers,
      reorderTabGroupUrlsUseCase,
    ],
  )

  // 検索クエリがあり、かつ表示可能なドメインがない場合は非表示
  if (hasSearchQuery && !hasVisibleDomains) {
    return null
  }

  return (
    <CategoryGroupContext value={contextValue}>
      <fieldset
        ref={setNodeRef}
        style={style}
        className='m-0 min-w-0 border-0 p-0'
        data-saved-tabs-scroll-target='parent'
        aria-label={t('savedTabs.categoryGroupAria', undefined, {
          name: category.name,
        })}
        onDragOver={state.nativeDnD.handleDragOver}
        onDragLeave={state.nativeDnD.handleDragLeave}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onDrop={(e) => {
          state.nativeDnD.handleDrop(e, handlers.handleMoveDomainToCategory)
        }}
      >
        {children}
      </fieldset>

      {/* カテゴリ管理モーダル */}
      <CategoryManagementModal
        isOpen={state.modal.isModalOpen}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClose={() => {
          state.modal.setIsModalOpen(false)
        }}
        category={category}
        domains={state.localDomains}
        deps={categoryManagementModalDeps}
        useCases={categoryManagementModalUseCases}
      />
    </CategoryGroupContext>
  )
}

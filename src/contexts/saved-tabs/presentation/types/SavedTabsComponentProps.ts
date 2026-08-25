/**
 * SavedTabs 表示コンポーネント間で共有する props 型。
 *
 * これらは presentation 層の型であり、storage 型を直接参照しない。
 * 必要な DTO は `SavedTabsPresentationDto` から再エクスポートして使う
 * (issue #589)。
 */

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettings,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

export type DomainCardActionHandlers = {
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => void
  handleDeleteGroup: (id: string) => void
  handleDeleteGroups?: (ids: string[]) => void
  handleDeleteUrl: (groupId: string, url: string) => void
  handleDeleteUrls?: (groupId: string, urls: string[]) => Promise<void>
  handleOpenTab: (url: string) => void
  handleUpdateUrls: (groupId: string, updatedUrls: TabGroup['urls']) => void
  handleDeleteCategory?: (groupId: string, categoryName: string) => void
}

// カテゴリグループコンポーネント
export type CategoryGroupProps = DomainCardActionHandlers & {
  category: ParentCategory
  domains: TabGroup[]
  handleUpdateDomainsOrder?: (
    categoryId: string,
    updatedDomains: TabGroup[],
  ) => void
  handleMoveDomainToCategory?: (
    domainId: string,
    fromCategoryId: string | null,
    toCategoryId: string,
  ) => void
  settings: UserSettings
  isCategoryReorderMode?: boolean // 親カテゴリ並び替えモード状態
  searchQuery?: string // 検索クエリ
}

// ドメインカード用のソータブルコンポーネントの型
export type SortableDomainCardProps = DomainCardActionHandlers & {
  group: TabGroup
  categoryId?: string // 親カテゴリID
  isDraggingOver?: boolean // ドラッグオーバー状態
  settings?: UserSettings // 設定プロパティ
  isReorderMode?: boolean // 並び替えモード状態
  searchQuery?: string // 検索クエリ
}

// カテゴリセクションコンポーネント
export type CategorySectionProps = {
  categoryName: string
  urls: TabGroup['urls']
  groupId: string
  handleDeleteUrl: (groupId: string, url: string) => void
  handleOpenTab: (url: string) => void
  handleUpdateUrls: (groupId: string, updatedUrls: TabGroup['urls']) => void
  handleOpenAllTabs?: (urls: { url: string; title: string }[]) => void
  scrollTarget?: boolean
  settings: UserSettings
}

// 並び替え可能なカテゴリセクションコンポーネント
export type SortableCategorySectionProps = CategorySectionProps & {
  id: string // ソート用の一意のID
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => void // すべて開く処理
  stickyTop?: string // Sticky位置のクラス名（オプション）
  isReorderMode?: boolean // 並び替えモード状態
}

// URL項目用のソータブルコンポーネント
export type SortableUrlItemProps = {
  url: string
  title: string
  id: string
  groupId: string
  subCategory?: string
  savedAt?: number
  autoDeletePeriod?: string
  availableSubCategories?: string[]
  handleDeleteUrl: (groupId: string, url: string) => void
  handleOpenTab: (url: string) => void
  handleSetSubCategory?: (
    groupId: string,
    url: string,
    subCategory: string,
  ) => void
  handleUpdateUrls: (
    groupId: string,
    updatedUrls: { url: string; title: string; subCategory?: string }[],
  ) => void
  categoryContext?: string
  settings: UserSettings
}

// カード内のURL一覧
export type UrlListProps = {
  items: TabGroup['urls']
  groupId: string
  subCategories?: string[]
  handleDeleteUrl: (groupId: string, url: string) => void
  handleOpenTab: (url: string) => void
  handleUpdateUrls: (groupId: string, updatedUrls: TabGroup['urls']) => void
  handleSetSubCategory?: (
    groupId: string,
    url: string,
    subCategory: string,
  ) => void
  settings: UserSettings
}

// カテゴリキーワード管理モーダルコンポーネント
export type CategoryKeywordModalProps = {
  group: TabGroup
  isOpen: boolean
  onClose: () => void
  onSave: (groupId: string, categoryName: string, keywords: string[]) => void
  onDeleteCategory: (groupId: string, categoryName: string) => void
  parentCategories?: ParentCategory[]
  onCreateParentCategory: (name: string) => Promise<ParentCategory>
  onAssignToParentCategory: (
    groupId: string,
    categoryId: string,
  ) => Promise<void>
  onUpdateParentCategories?: (categories: ParentCategory[]) => void
}

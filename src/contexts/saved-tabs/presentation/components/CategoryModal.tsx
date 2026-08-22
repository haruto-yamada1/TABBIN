import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { CategoryCreateSection } from './category-modal/CategoryCreateSection'
import { CategoryModalRoot } from './category-modal/CategoryModalRoot'
import { CategorySelector } from './category-modal/CategorySelector'
import { DomainSelectionList } from './category-modal/DomainSelectionList'

/** CategoryModal コンポーネントの props */
type CategoryModalProps = {
  /** モーダルを閉じるハンドラ */
  onClose: () => void
  /** タブグループ一覧 */
  tabGroups: TabGroup[]
  /** 保存タブページ全体 query (issue #510)。`useCategoryModal` へ伝搬する。*/
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  /** 親カテゴリ作成 use-case。`useCategoryModal` へ伝搬する。*/
  createParentCategoryUseCase?: CreateParentCategoryUseCase
  /** 親カテゴリ削除 use-case。`useCategoryModal` へ伝搬する。*/
  deleteParentCategoryUseCase?: DeleteParentCategoryUseCase
  /** ドメイン割当 use-case。`useCategoryModal` へ伝搬する。*/
  assignDomainToCategoryUseCase?: AssignDomainToCategoryUseCase
}

/**
 * 親カテゴリ管理モーダルコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CategoryModalProps
 */
export const CategoryModal = ({
  onClose,
  tabGroups,
  getSavedTabsPageDataQuery,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
}: CategoryModalProps) => (
  <CategoryModalRoot
    {...(assignDomainToCategoryUseCase !== undefined
      ? { assignDomainToCategoryUseCase }
      : {})}
    {...(createParentCategoryUseCase !== undefined
      ? { createParentCategoryUseCase }
      : {})}
    {...(deleteParentCategoryUseCase !== undefined
      ? { deleteParentCategoryUseCase }
      : {})}
    getSavedTabsPageDataQuery={getSavedTabsPageDataQuery}
    onClose={onClose}
    tabGroups={tabGroups}
  >
    <CategoryCreateSection />
    <CategorySelector />
    <DomainSelectionList />
  </CategoryModalRoot>
)

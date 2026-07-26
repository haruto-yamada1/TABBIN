import type { SavedTabsParentCategoryDto as ParentCategory } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { CategoryKeywordModalProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'

import { KeywordEditor } from './keyword-modal/KeywordEditor'
import { KeywordModalRoot } from './keyword-modal/KeywordModalRoot'
import { SubCategoryAddSection } from './keyword-modal/SubCategoryAddSection'
import { SubCategorySelector } from './keyword-modal/SubCategorySelector'

const EMPTY_PARENT_CATEGORIES: ParentCategory[] = []

/**
 * カテゴリキーワード管理モーダルコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CategoryKeywordModalProps
 */
type CategoryKeywordModalExtraProps = {
  readonly storageChangePort?: StorageChangePort
  /** 永続化依存 (issue #510)。`CategoryAssignmentPort` +
   * `GetSavedTabsPageDataQuery` の 2 つへ集約する。 */
  readonly deps: {
    categoryAssignmentPort: CategoryAssignmentPort
    getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  }
}

export const CategoryKeywordModal = ({
  group,
  isOpen,
  onClose,
  onSave,
  onDeleteCategory,
  parentCategories: initialParentCategories = EMPTY_PARENT_CATEGORIES,
  onUpdateParentCategories,
  storageChangePort,
  deps,
}: CategoryKeywordModalProps & CategoryKeywordModalExtraProps) => (
  <KeywordModalRoot
    group={group}
    isOpen={isOpen}
    onClose={onClose}
    onSave={onSave}
    onDeleteCategory={onDeleteCategory}
    initialParentCategories={initialParentCategories}
    onUpdateParentCategories={onUpdateParentCategories}
    deps={deps}
    storageChangePort={storageChangePort}
  >
    <SubCategoryAddSection />
    <SubCategorySelector />
    <KeywordEditor />
  </KeywordModalRoot>
)

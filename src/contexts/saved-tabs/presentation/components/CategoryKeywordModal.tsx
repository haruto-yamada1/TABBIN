import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { CategoryKeywordModalProps } from '@/types/saved-tabs'
import type { ParentCategory } from '@/types/storage'

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
interface CategoryKeywordModalExtraProps {
  readonly storageChangePort?: StorageChangePort
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
}: CategoryKeywordModalProps & CategoryKeywordModalExtraProps) => (
  <KeywordModalRoot
    group={group}
    isOpen={isOpen}
    onClose={onClose}
    onSave={onSave}
    onDeleteCategory={onDeleteCategory}
    initialParentCategories={initialParentCategories}
    onUpdateParentCategories={onUpdateParentCategories}
    storageChangePort={storageChangePort}
  >
    <SubCategoryAddSection />
    <SubCategorySelector />
    <KeywordEditor />
  </KeywordModalRoot>
)

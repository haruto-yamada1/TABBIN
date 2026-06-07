import type { CategoryKeywordModalProps } from '@/types/saved-tabs'

import { KeywordEditor } from './keyword-modal/KeywordEditor'
import { KeywordModalRoot } from './keyword-modal/KeywordModalRoot'
import { SubCategoryAddSection } from './keyword-modal/SubCategoryAddSection'
import { SubCategorySelector } from './keyword-modal/SubCategorySelector'

const EMPTY_PARENT_CATEGORIES: NonNullable<
  CategoryKeywordModalProps['parentCategories']
> = []

/**
 * カテゴリキーワード管理モーダルコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CategoryKeywordModalProps
 */
export const CategoryKeywordModal = ({
  group,
  isOpen,
  onClose,
  onSave,
  onDeleteCategory,
  // eslint-disable-next-line typescript/no-useless-default-assignment
  parentCategories: initialParentCategories = EMPTY_PARENT_CATEGORIES,
  onUpdateParentCategories,
}: CategoryKeywordModalProps) => (
  <KeywordModalRoot
    group={group}
    isOpen={isOpen}
    onClose={onClose}
    onSave={onSave}
    onDeleteCategory={onDeleteCategory}
    initialParentCategories={initialParentCategories}
    onUpdateParentCategories={onUpdateParentCategories}
  >
    <SubCategoryAddSection />
    <SubCategorySelector />
    <KeywordEditor />
  </KeywordModalRoot>
)

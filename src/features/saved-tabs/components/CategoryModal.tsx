import type { TabGroup } from '@/types/storage'

import { CategoryCreateSection } from './category-modal/CategoryCreateSection'
import { CategoryModalRoot } from './category-modal/CategoryModalRoot'
import { CategorySelector } from './category-modal/CategorySelector'
import { DomainSelectionList } from './category-modal/DomainSelectionList'

/** CategoryModal コンポーネントの props */
interface CategoryModalProps {
  /** モーダルを閉じるハンドラ */
  onClose: () => void
  /** タブグループ一覧 */
  tabGroups: TabGroup[]
}

/**
 * 親カテゴリ管理モーダルコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CategoryModalProps
 */
export const CategoryModal = ({ onClose, tabGroups }: CategoryModalProps) => (
  <CategoryModalRoot onClose={onClose} tabGroups={tabGroups}>
    <CategoryCreateSection />
    <CategorySelector />
    <DomainSelectionList />
  </CategoryModalRoot>
)

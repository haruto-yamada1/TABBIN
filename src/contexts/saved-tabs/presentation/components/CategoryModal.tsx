import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
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
  /** 親カテゴリ永続化先。`useCategoryModal` へ伝搬する。*/
  parentCategoryRepository?: ParentCategoryRepository
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
  parentCategoryRepository,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
}: CategoryModalProps) => (
  <CategoryModalRoot
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    assignDomainToCategoryUseCase={assignDomainToCategoryUseCase as never}
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    createParentCategoryUseCase={createParentCategoryUseCase as never}
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    deleteParentCategoryUseCase={deleteParentCategoryUseCase as never}
    onClose={onClose}
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    parentCategoryRepository={parentCategoryRepository as never}
    tabGroups={tabGroups}
  >
    <CategoryCreateSection />
    <CategorySelector />
    <DomainSelectionList />
  </CategoryModalRoot>
)

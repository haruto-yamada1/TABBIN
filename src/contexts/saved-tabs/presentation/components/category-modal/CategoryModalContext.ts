import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { useCategoryModal } from '@/contexts/saved-tabs/presentation/hooks/useCategoryModal'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'

/** CategoryModal のコンテキスト型 */
export interface CategoryModalContextType {
  /** フック戻り値 */
  state: ReturnType<typeof useCategoryModal>
  /** タブグループ一覧 */
  tabGroups: TabGroup[]
}

export const {
  context: CategoryModalContext,
  useCompoundContext: useCategoryModalContext,
} = createCompoundContext<CategoryModalContextType>('CategoryModal')

import { createCompoundContext } from '@/lib/ui/createCompoundContext'
import type { TabGroup } from '@/types/storage'

import type { useCategoryModal } from '../../hooks/useCategoryModal'

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

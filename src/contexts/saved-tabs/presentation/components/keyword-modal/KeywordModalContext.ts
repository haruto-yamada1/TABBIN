import type { useCategoryKeywordModal } from '@/contexts/saved-tabs/presentation/hooks/useCategoryKeywordModal'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'
import type { TabGroup } from '@/types/storage'

/** KeywordModal のコンテキスト型 */
export interface KeywordModalContextType {
  /** フック戻り値 */
  state: ReturnType<typeof useCategoryKeywordModal>
  /** タブグループデータ */
  group: TabGroup
}

export const {
  context: KeywordModalContext,
  useCompoundContext: useKeywordModal,
} = createCompoundContext<KeywordModalContextType>('KeywordModal')

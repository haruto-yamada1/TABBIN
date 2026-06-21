import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'

import type { SavedTabsUseCasesContextValue } from './SavedTabsUseCasesContext'

/**
 * 渡された `deps` から `SavedTabsUseCasesContextValue` を組み立てる。
 *
 * chrome 依存を初期化しないため、SSR / Storybook / テストでも安全に呼べる。
 * 実機環境で `deps` を組み立てるには
 * `createSavedTabsUseCasesDeps()`（`@/app/composition`）を使う。
 */
export const createSavedTabsUseCasesContextValueFromDeps = (
  deps: SavedTabsUseCasesDeps,
): SavedTabsUseCasesContextValue => ({
  deps,
  useCases: createSavedTabsUseCases(deps),
})

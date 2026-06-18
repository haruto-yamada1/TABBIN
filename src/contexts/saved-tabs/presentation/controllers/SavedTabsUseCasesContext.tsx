import { createContext, use } from 'react'

import { createSavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'

/**
 * `SavedTabsPage` 配下に use-case ハンドルと deps を配布する Context。
 *
 * presentation 層のコンポーネントが追加で use-case を呼びたい場合、
 * `useSavedTabsUseCases()` から取り出して直接呼ぶ。
 * 「components から use-case を直接呼ぶ」設計は濫用禁止のため、controller hook
 * 側の拡張（`useDomainModeController` / `useCustomModeController`）を優先する。
 */
export interface SavedTabsUseCasesContextValue {
  readonly deps: SavedTabsUseCasesDeps
  readonly useCases: SavedTabsUseCases
}

const SavedTabsUseCasesContext =
  createContext<SavedTabsUseCasesContextValue | null>(null)

/**
 * `SavedTabsUseCasesContext` の Provider。
 */
export const SavedTabsUseCasesProvider = ({
  value,
  children,
}: {
  value: SavedTabsUseCasesContextValue
  children: React.ReactNode
}) => (
  <SavedTabsUseCasesContext.Provider value={value}>
    {children}
  </SavedTabsUseCasesContext.Provider>
)

/**
 * `SavedTabsUseCasesContext` の値を取り出す。Provider 外で呼ぶと `null`。
 */
export const useSavedTabsUseCases = (): SavedTabsUseCasesContextValue | null =>
  use(SavedTabsUseCasesContext)

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

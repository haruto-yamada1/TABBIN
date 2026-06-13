import { createSavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import { createSavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import type { SavedTabsUseCasesContextValue } from './SavedTabsUseCasesContext'

/**
 * chrome 実環境向けに SavedTabsUseCasesContextValue を構築する。
 *
 * `createSavedTabsUseCasesDeps()` が chrome.* / repository factory を経由して
 * 永続化層を立ち上げるため、SSR / Storybook / テストなど chrome 不在環境では
 * 代わりに `createSavedTabsUseCasesContextValueFromDeps` を使う。
 */
export const createSavedTabsUseCasesContextValue =
  (): SavedTabsUseCasesContextValue => {
    const deps = createSavedTabsUseCasesDeps()
    const useCases: SavedTabsUseCases = createSavedTabsUseCases(deps)
    return { deps, useCases }
  }

export type { SavedTabsUseCases, SavedTabsUseCasesDeps }

import type { SetCategoryKeywordsCommand } from '@/contexts/saved-tabs/application/commands/SetCategoryKeywordsCommand'
import type { SetCategoryKeywordsPort } from '@/contexts/saved-tabs/application/ports/SetCategoryKeywordsPort'

/**
 * `SetCategoryKeywordsUseCase` が依存する port 群。
 *
 * `setCategoryKeywordsPort` 経由で旧 `lib/storage/tabs.setCategoryKeywords`
 * 相当の副作用（`TabGroup` の `categoryKeywords` 更新 /
 * `DomainCategorySettings` 同期 / `urlSubCategories` 再計算）を
 * まとめて実行する。
 */
export interface SetCategoryKeywordsUseCaseDeps {
  readonly setCategoryKeywordsPort: SetCategoryKeywordsPort
}

/**
 * `SetCategoryKeywordsUseCase` の関数型。
 */
export type SetCategoryKeywordsUseCase = (
  command: SetCategoryKeywordsCommand,
) => Promise<void>

/**
 * `SetCategoryKeywordsUseCase` を生成する。
 *
 * 旧 `src/lib/storage/tabs.setCategoryKeywords` の use-case 化。
 * domain / application 層が rich 補助フィールドを持たない設計の
 * ため、port 経由で既存挙動を保全する（issue #501）。
 */
export const createSetCategoryKeywordsUseCase = (
  deps: SetCategoryKeywordsUseCaseDeps,
): SetCategoryKeywordsUseCase => {
  return async (command) => {
    await deps.setCategoryKeywordsPort.setCategoryKeywords(
      command.tabGroupId,
      command.categoryName,
      command.keywords,
    )
  }
}

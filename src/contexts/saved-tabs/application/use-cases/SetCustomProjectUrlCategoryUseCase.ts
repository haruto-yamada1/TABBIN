import type { SetCustomProjectUrlCategoryCommand } from '@/contexts/saved-tabs/application/commands/SetCustomProjectUrlCategoryCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `SetCustomProjectUrlCategoryUseCase` が依存する port。
 */
export type SetCustomProjectUrlCategoryUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `SetCustomProjectUrlCategoryUseCase` の関数型。
 */
export type SetCustomProjectUrlCategoryUseCase = (
  command: SetCustomProjectUrlCategoryCommand,
) => Promise<void>

/**
 * `SetCustomProjectUrlCategoryUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleSetUrlCategory` 内の
 * `customProjectsCommandService.setUrlCategory(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。`category` を省略すると
 * 未分類として保存される port 仕様に合わせる。
 *
 * @example
 * ```ts
 * const setCustomProjectUrlCategory = createSetCustomProjectUrlCategoryUseCase({
 *   customProjectsCommandService,
 * })
 * await setCustomProjectUrlCategory({
 *   category: 'Inbox',
 *   projectId: 'project-1',
 *   url: 'https://example.com/a',
 * })
 * ```
 */
export const createSetCustomProjectUrlCategoryUseCase = (
  deps: SetCustomProjectUrlCategoryUseCaseDeps,
): SetCustomProjectUrlCategoryUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.setUrlCategory(
      command.projectId,
      command.url,
      command.category,
    )
  }
}

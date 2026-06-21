import type { UpdateCustomProjectCategoryOrderCommand } from '@/contexts/saved-tabs/application/commands/UpdateCustomProjectCategoryOrderCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `UpdateCustomProjectCategoryOrderUseCase` が依存する port。
 */
export interface UpdateCustomProjectCategoryOrderUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `UpdateCustomProjectCategoryOrderUseCase` の関数型。
 */
export type UpdateCustomProjectCategoryOrderUseCase = (
  command: UpdateCustomProjectCategoryOrderCommand,
) => Promise<void>

/**
 * `UpdateCustomProjectCategoryOrderUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleUpdateCategoryOrder` 内の
 * `customProjectsCommandService.updateCategoryOrder(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。`newOrder` は category
 * 名の新しい表示順。
 *
 * @example
 * ```ts
 * const updateCustomProjectCategoryOrder =
 *   createUpdateCustomProjectCategoryOrderUseCase({
 *     customProjectsCommandService,
 *   })
 * await updateCustomProjectCategoryOrder({
 *   newOrder: ['Inbox', 'Done'],
 *   projectId: 'project-1',
 * })
 * ```
 */
export const createUpdateCustomProjectCategoryOrderUseCase = (
  deps: UpdateCustomProjectCategoryOrderUseCaseDeps,
): UpdateCustomProjectCategoryOrderUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.updateCategoryOrder(
      command.projectId,
      [...command.newOrder],
    )
  }
}

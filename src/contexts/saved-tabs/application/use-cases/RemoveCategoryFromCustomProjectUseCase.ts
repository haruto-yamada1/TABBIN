import type { RemoveCategoryFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveCategoryFromCustomProjectCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `RemoveCategoryFromCustomProjectUseCase` が依存する port。
 */
export interface RemoveCategoryFromCustomProjectUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `RemoveCategoryFromCustomProjectUseCase` の関数型。
 */
export type RemoveCategoryFromCustomProjectUseCase = (
  command: RemoveCategoryFromCustomProjectCommand,
) => Promise<void>

/**
 * `RemoveCategoryFromCustomProjectUseCase` を生成する (issue #540)。
 *
 * 旧 `useProjectManagement.handleDeleteProjectCategory` 内の
 * `customProjectsCommandService.removeCategoryFromProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。
 *
 * @example
 * ```ts
 * const removeCategoryFromCustomProject = createRemoveCategoryFromCustomProjectUseCase({
 *   customProjectsCommandService,
 * })
 * await removeCategoryFromCustomProject({
 *   projectId: 'project-1',
 *   categoryName: 'Inbox',
 * })
 * ```
 */
export const createRemoveCategoryFromCustomProjectUseCase = (
  deps: RemoveCategoryFromCustomProjectUseCaseDeps,
): RemoveCategoryFromCustomProjectUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.removeCategoryFromProject(
      command.projectId,
      command.categoryName,
    )
  }
}

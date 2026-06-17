import type { RenameCustomProjectCategoryCommand } from '../commands/RenameCustomProjectCategoryCommand'
import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'

/**
 * `RenameCustomProjectCategoryUseCase` が依存する port。
 */
export interface RenameCustomProjectCategoryUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `RenameCustomProjectCategoryUseCase` の関数型。
 */
export type RenameCustomProjectCategoryUseCase = (
  command: RenameCustomProjectCategoryCommand,
) => Promise<void>

/**
 * `RenameCustomProjectCategoryUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleRenameCategory` 内の
 * `customProjectsCommandService.renameCategoryInProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。`categories` /
 * `categoryOrder` / `urlMetadata.category` を port 実装側で
 * 一括 rename する。
 *
 * @example
 * ```ts
 * const renameCustomProjectCategory = createRenameCustomProjectCategoryUseCase({
 *   customProjectsCommandService,
 * })
 * await renameCustomProjectCategory({
 *   newCategoryName: 'Later',
 *   oldCategoryName: 'Inbox',
 *   projectId: 'project-1',
 * })
 * ```
 */
export const createRenameCustomProjectCategoryUseCase = (
  deps: RenameCustomProjectCategoryUseCaseDeps,
): RenameCustomProjectCategoryUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.renameCategoryInProject(
      command.projectId,
      command.oldCategoryName,
      command.newCategoryName,
    )
  }
}

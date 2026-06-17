import type { AddCategoryToCustomProjectCommand } from '../commands/AddCategoryToCustomProjectCommand'
import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'

/**
 * `AddCategoryToCustomProjectUseCase` が依存する port。
 */
export interface AddCategoryToCustomProjectUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `AddCategoryToCustomProjectUseCase` の関数型。
 */
export type AddCategoryToCustomProjectUseCase = (
  command: AddCategoryToCustomProjectCommand,
) => Promise<void>

/**
 * `AddCategoryToCustomProjectUseCase` を生成する (issue #540)。
 *
 * 旧 `useProjectManagement.handleAddCategory` 内の
 * `customProjectsCommandService.addCategoryToProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。
 *
 * issue #539 で 8 操作が use-case 化されたが、`addCategoryToProject` /
 * `removeCategoryFromProject` は「カテゴリ並び順を持つ rich 補助
 * フィールドを mutate する」性質上 port 仕様への薄いラッパにとどめ、
 * presentation 層からの直接 port 呼び出しを置換するために本 use-case を
 * 用意する。
 *
 * @example
 * ```ts
 * const addCategoryToCustomProject = createAddCategoryToCustomProjectUseCase({
 *   customProjectsCommandService,
 * })
 * await addCategoryToCustomProject({
 *   projectId: 'project-1',
 *   categoryName: 'Inbox',
 * })
 * ```
 */
export const createAddCategoryToCustomProjectUseCase = (
  deps: AddCategoryToCustomProjectUseCaseDeps,
): AddCategoryToCustomProjectUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.addCategoryToProject(
      command.projectId,
      command.categoryName,
    )
  }
}

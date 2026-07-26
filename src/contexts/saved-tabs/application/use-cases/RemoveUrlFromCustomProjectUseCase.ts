import type { RemoveUrlFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveUrlFromCustomProjectCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `RemoveUrlFromCustomProjectUseCase` が依存する port。
 */
export type RemoveUrlFromCustomProjectUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `RemoveUrlFromCustomProjectUseCase` の関数型。
 */
export type RemoveUrlFromCustomProjectUseCase = (
  command: RemoveUrlFromCustomProjectCommand,
) => Promise<void>

/**
 * `RemoveUrlFromCustomProjectUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleDeleteUrlFromProject` 内の
 * `customProjectsCommandService.removeUrlFromCustomProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。Undo 用 snapshot は
 * presentation 層 (`useProjectManagement`) 側で
 * `getCustomProjectUndoSnapshot` 経由で取得してから本 use-case を
 * 呼ぶ形にする。
 *
 * @example
 * ```ts
 * const removeUrlFromCustomProject = createRemoveUrlFromCustomProjectUseCase({
 *   customProjectsCommandService,
 * })
 * await removeUrlFromCustomProject({
 *   projectId: 'project-1',
 *   url: 'https://example.com/a',
 * })
 * ```
 */
export const createRemoveUrlFromCustomProjectUseCase = (
  deps: RemoveUrlFromCustomProjectUseCaseDeps,
): RemoveUrlFromCustomProjectUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.removeUrlFromCustomProject(
      command.projectId,
      command.url,
    )
  }
}

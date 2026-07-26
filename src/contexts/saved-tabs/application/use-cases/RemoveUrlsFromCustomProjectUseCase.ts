import type { RemoveUrlsFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveUrlsFromCustomProjectCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `RemoveUrlsFromCustomProjectUseCase` が依存する port。
 */
export type RemoveUrlsFromCustomProjectUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `RemoveUrlsFromCustomProjectUseCase` の関数型。
 */
export type RemoveUrlsFromCustomProjectUseCase = (
  command: RemoveUrlsFromCustomProjectCommand,
) => Promise<void>

/**
 * `RemoveUrlsFromCustomProjectUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleDeleteUrlsFromProject` 内の
 * `customProjectsCommandService.removeUrlsFromCustomProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。
 *
 * 別 use-case `RemoveUrlsFromCustomProjectsUseCase` (issue #512) は
 * 「全プロジェクト横断」の bulk 削除 (modern / legacy 形式両対応)
 * を担当し、本 use-case は単一 project 配下のみを担当する点で
 * 責務が異なる。`urls` が空配列なら port 実装側で no-op となる。
 *
 * @example
 * ```ts
 * const removeUrlsFromCustomProject = createRemoveUrlsFromCustomProjectUseCase({
 *   customProjectsCommandService,
 * })
 * await removeUrlsFromCustomProject({
 *   projectId: 'project-1',
 *   urls: ['https://example.com/a', 'https://example.com/b'],
 * })
 * ```
 */
export const createRemoveUrlsFromCustomProjectUseCase = (
  deps: RemoveUrlsFromCustomProjectUseCaseDeps,
): RemoveUrlsFromCustomProjectUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.removeUrlsFromCustomProject(
      command.projectId,
      [...command.urls],
    )
  }
}

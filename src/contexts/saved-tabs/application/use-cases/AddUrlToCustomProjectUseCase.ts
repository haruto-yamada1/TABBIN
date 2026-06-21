import type { AddUrlToCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/AddUrlToCustomProjectCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `AddUrlToCustomProjectUseCase` が依存する port。
 */
export interface AddUrlToCustomProjectUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `AddUrlToCustomProjectUseCase` の関数型。
 */
export type AddUrlToCustomProjectUseCase = (
  command: AddUrlToCustomProjectCommand,
) => Promise<void>

/**
 * `AddUrlToCustomProjectUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleAddUrlToProject` 内の
 * `customProjectsCommandService.addUrlToCustomProject(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。
 *
 * rich 補助フィールド (`urlMetadata` / `projectKeywords` / `urls`) は
 * port 実装 (`LibCustomProjectsCommandService`) 側で lib/storage
 * `addUrlToCustomProject` へ delegate する際に original raw から
 * 持ち越される。presentation 層は deps に command service を持たず、
 * use-case だけを呼ぶ。
 *
 * @example
 * ```ts
 * const addUrlToCustomProject = createAddUrlToCustomProjectUseCase({
 *   customProjectsCommandService,
 * })
 * await addUrlToCustomProject({
 *   projectId: 'project-1',
 *   title: 'Example',
 *   url: 'https://example.com/a',
 * })
 * ```
 */
export const createAddUrlToCustomProjectUseCase = (
  deps: AddUrlToCustomProjectUseCaseDeps,
): AddUrlToCustomProjectUseCase => {
  return async (command) => {
    const options: { notes?: string; category?: string } = {}
    if (command.notes !== undefined) {
      options.notes = command.notes
    }
    if (command.category !== undefined) {
      options.category = command.category
    }
    await deps.customProjectsCommandService.addUrlToCustomProject(
      command.projectId,
      command.url,
      command.title,
      Object.keys(options).length > 0 ? options : undefined,
    )
  }
}

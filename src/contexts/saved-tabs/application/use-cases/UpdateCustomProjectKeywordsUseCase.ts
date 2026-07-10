import type { UpdateCustomProjectKeywordsCommand } from '@/contexts/saved-tabs/application/commands/UpdateCustomProjectKeywordsCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `UpdateCustomProjectKeywordsUseCase` が依存する port。
 */
export type UpdateCustomProjectKeywordsUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `UpdateCustomProjectKeywordsUseCase` の関数型。
 */
export type UpdateCustomProjectKeywordsUseCase = (
  command: UpdateCustomProjectKeywordsCommand,
) => Promise<void>

/**
 * `UpdateCustomProjectKeywordsUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleUpdateProjectKeywords` 内の
 * `customProjectsCommandService.updateProjectKeywords(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。`projectKeywords` は
 * title / URL / domain 自動振り分け用のキーワード設定。
 *
 * @example
 * ```ts
 * const updateCustomProjectKeywords = createUpdateCustomProjectKeywordsUseCase({
 *   customProjectsCommandService,
 * })
 * await updateCustomProjectKeywords({
 *   projectId: 'project-1',
 *   projectKeywords: {
 *     titleKeywords: ['docs'],
 *     urlKeywords: ['example'],
 *     domainKeywords: ['example.com'],
 *   },
 * })
 * ```
 */
export const createUpdateCustomProjectKeywordsUseCase = (
  deps: UpdateCustomProjectKeywordsUseCaseDeps,
): UpdateCustomProjectKeywordsUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.updateProjectKeywords(
      command.projectId,
      command.projectKeywords,
    )
  }
}

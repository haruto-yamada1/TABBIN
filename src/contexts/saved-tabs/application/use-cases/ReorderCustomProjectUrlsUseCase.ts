import type { ReorderCustomProjectUrlsCommand } from '@/contexts/saved-tabs/application/commands/ReorderCustomProjectUrlsCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `ReorderCustomProjectUrlsUseCase` が依存する port。
 */
export type ReorderCustomProjectUrlsUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `ReorderCustomProjectUrlsUseCase` の関数型。
 */
export type ReorderCustomProjectUrlsUseCase = (
  command: ReorderCustomProjectUrlsCommand,
) => Promise<void>

/**
 * `ReorderCustomProjectUrlsUseCase` を生成する (issue #539)。
 *
 * 旧 `useProjectManagement.handleReorderUrls` 内の
 * `customProjectsCommandService.reorderProjectUrls(...)` 直叩きを
 * application use-case へ移設する薄いラッパ。
 *
 * port 仕様では `urls` は `CustomProject['urls']` 形。`@/types/storage`
 * への依存は use-case 境界 interface に閉じ、application 層の
 * それ以外のファイルは storage 型を import しない方針 (issue #511)
 * を維持する。
 *
 * @example
 * ```ts
 * const reorderCustomProjectUrls = createReorderCustomProjectUrlsUseCase({
 *   customProjectsCommandService,
 * })
 * await reorderCustomProjectUrls({
 *   projectId: 'project-1',
 *   urls: [{ title: 'B', url: 'https://example.com/b' }],
 * })
 * ```
 */
export const createReorderCustomProjectUrlsUseCase = (
  deps: ReorderCustomProjectUrlsUseCaseDeps,
): ReorderCustomProjectUrlsUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.reorderProjectUrls(
      command.projectId,
      command.urls,
    )
  }
}

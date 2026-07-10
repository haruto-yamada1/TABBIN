import type { MoveUrlBetweenCustomProjectsCommand } from '@/contexts/saved-tabs/application/commands/MoveUrlBetweenCustomProjectsCommand'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

/**
 * `MoveUrlBetweenCustomProjectsUseCase` が依存する port。
 */
export type MoveUrlBetweenCustomProjectsUseCaseDeps = {
  readonly customProjectsCommandService: CustomProjectsCommandService
}

/**
 * `MoveUrlBetweenCustomProjectsUseCase` の関数型。
 */
export type MoveUrlBetweenCustomProjectsUseCase = (
  command: MoveUrlBetweenCustomProjectsCommand,
) => Promise<void>

/**
 * `MoveUrlBetweenCustomProjectsUseCase` を生成する (issue #540)。
 *
 * 旧 `SavedTabsApp.handleMoveUrlBetweenProjects` 内の
 * `customProjectsCommandService.moveUrlBetweenCustomProjects(...)`
 * 直叩きを application use-case へ移設する薄いラッパ。presentation 層
 * (`SavedTabsApp` / `CustomModeContainer`) は本 use-case を介して
 * 移動処理を呼び、port 仕様 (`CustomProjectsCommandService`) への
 * 直接依存を撤去する (受け入れ条件「handleMoveUrlBetweenProjects が
 * application use-case 経由になっている」)。
 *
 * 旧 `SavedTabsApp` 側の `customProjectRepository.findAll()` 直叩きも
 * `getCustomProjects` query 経由へ置換済み (本 use-case 自体は
 * 移動の mutation のみを担当し、presentation 側 state 同期は
 * `getCustomProjects` query を `useEffect` / `setCustomProjects` で
 * 行う)。
 *
 * @example
 * ```ts
 * const moveUrlBetweenCustomProjects = createMoveUrlBetweenCustomProjectsUseCase({
 *   customProjectsCommandService,
 * })
 * await moveUrlBetweenCustomProjects({
 *   sourceProjectId: 'project-a',
 *   targetProjectId: 'project-b',
 *   url: 'https://example.com/a',
 * })
 * ```
 */
export const createMoveUrlBetweenCustomProjectsUseCase = (
  deps: MoveUrlBetweenCustomProjectsUseCaseDeps,
): MoveUrlBetweenCustomProjectsUseCase => {
  return async (command) => {
    await deps.customProjectsCommandService.moveUrlBetweenCustomProjects(
      command.sourceProjectId,
      command.targetProjectId,
      command.url,
    )
  }
}

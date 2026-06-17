/**
 * `MoveUrlBetweenCustomProjectsUseCase` の入力 (issue #540)。
 *
 * 旧 `SavedTabsApp.handleMoveUrlBetweenProjects` が
 * `CustomProjectsCommandService.moveUrlBetweenCustomProjects` を
 * 直接呼んでいた経路を application use-case へ移設する。
 * `sourceProjectId` / `targetProjectId` / `url` は
 * `lib/storage/projects.moveUrlBetweenCustomProjects` と同じ positional
 * 引数でそのまま port 実装へ伝搬する。
 *
 * @example
 * ```ts
 * const command: MoveUrlBetweenCustomProjectsCommand = {
 *   sourceProjectId: 'project-a',
 *   targetProjectId: 'project-b',
 *   url: 'https://example.com/a',
 * }
 * ```
 */
export interface MoveUrlBetweenCustomProjectsCommand {
  readonly sourceProjectId: string
  readonly targetProjectId: string
  readonly url: string
}

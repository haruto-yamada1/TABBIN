/**
 * `RemoveCategoryFromCustomProjectUseCase` の入力 (issue #540)。
 *
 * 旧 `useProjectManagement.handleDeleteProjectCategory` が
 * `CustomProjectsCommandService.removeCategoryFromProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`categoryName` は
 * `lib/storage/projects.removeCategoryFromProject` と同じ positional 引数で
 * そのまま port 実装へ伝搬する。
 *
 * @example
 * ```ts
 * const command: RemoveCategoryFromCustomProjectCommand = {
 *   projectId: 'project-1',
 *   categoryName: 'Inbox',
 * }
 * ```
 */
export interface RemoveCategoryFromCustomProjectCommand {
  readonly projectId: string
  readonly categoryName: string
}

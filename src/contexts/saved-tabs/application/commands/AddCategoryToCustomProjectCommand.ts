/**
 * `AddCategoryToCustomProjectUseCase` の入力 (issue #540)。
 *
 * 旧 `useProjectManagement.handleAddCategory` が
 * `CustomProjectsCommandService.addCategoryToProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`categoryName` は
 * `lib/storage/projects.addCategoryToProject` と同じ positional 引数で
 * そのまま port 実装へ伝搬する。
 *
 * @example
 * ```ts
 * const command: AddCategoryToCustomProjectCommand = {
 *   projectId: 'project-1',
 *   categoryName: 'Inbox',
 * }
 * ```
 */
export type AddCategoryToCustomProjectCommand = {
  readonly projectId: string
  readonly categoryName: string
}

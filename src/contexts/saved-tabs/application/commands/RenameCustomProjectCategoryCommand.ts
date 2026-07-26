/**
 * `RenameCustomProjectCategoryUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleRenameCategory` が
 * `CustomProjectsCommandService.renameCategoryInProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`categories` /
 * `categoryOrder` / `urlMetadata.category` を一括で rename する。
 *
 * @example
 * ```ts
 * const command: RenameCustomProjectCategoryCommand = {
 *   newCategoryName: 'Later',
 *   oldCategoryName: 'Inbox',
 *   projectId: 'project-1',
 * }
 * ```
 */
export type RenameCustomProjectCategoryCommand = {
  readonly projectId: string
  readonly oldCategoryName: string
  readonly newCategoryName: string
}

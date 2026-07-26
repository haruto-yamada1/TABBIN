/**
 * `UpdateCustomProjectCategoryOrderUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleUpdateCategoryOrder` が
 * `CustomProjectsCommandService.updateCategoryOrder` を直接呼んでいた
 * 経路を application use-case へ移設する。`newOrder` は category
 * 名の新しい表示順。
 *
 * @example
 * ```ts
 * const command: UpdateCustomProjectCategoryOrderCommand = {
 *   newOrder: ['Inbox', 'Done'],
 *   projectId: 'project-1',
 * }
 * ```
 */
export type UpdateCustomProjectCategoryOrderCommand = {
  readonly projectId: string
  readonly newOrder: readonly string[]
}

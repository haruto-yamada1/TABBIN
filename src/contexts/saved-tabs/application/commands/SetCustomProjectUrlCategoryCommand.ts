/**
 * `SetCustomProjectUrlCategoryUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleSetUrlCategory` が
 * `CustomProjectsCommandService.setUrlCategory` を直接呼んでいた
 * 経路を application use-case へ移設する。`category` を省略すると
 * 未分類 (undefined) として保存される。
 *
 * @example
 * ```ts
 * const command: SetCustomProjectUrlCategoryCommand = {
 *   category: 'Inbox',
 *   projectId: 'project-1',
 *   url: 'https://example.com/a',
 * }
 * ```
 */
export interface SetCustomProjectUrlCategoryCommand {
  readonly projectId: string
  readonly url: string
  readonly category?: string
}

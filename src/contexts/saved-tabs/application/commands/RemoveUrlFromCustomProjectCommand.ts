/**
 * `RemoveUrlFromCustomProjectUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleDeleteUrlFromProject` が
 * `CustomProjectsCommandService.removeUrlFromCustomProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`projectId` の URL 文字列を
 * 1 件だけ削除する。
 *
 * @example
 * ```ts
 * const command: RemoveUrlFromCustomProjectCommand = {
 *   projectId: 'project-1',
 *   url: 'https://example.com/a',
 * }
 * ```
 */
export type RemoveUrlFromCustomProjectCommand = {
  readonly projectId: string
  readonly url: string
}

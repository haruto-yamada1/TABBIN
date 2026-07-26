/**
 * `RemoveUrlsFromCustomProjectUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleDeleteUrlsFromProject` が
 * `CustomProjectsCommandService.removeUrlsFromCustomProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`projectId` から URL 文字列
 * 配列を一括削除する。
 *
 * 別 use-case `RemoveUrlsFromCustomProjectsUseCase`
 * (issue #512) は「全プロジェクト横断」の bulk 削除を担当する
 * ため、本 use-case (単一 project 配下) とは責務が異なる。
 *
 * @example
 * ```ts
 * const command: RemoveUrlsFromCustomProjectCommand = {
 *   projectId: 'project-1',
 *   urls: ['https://example.com/a', 'https://example.com/b'],
 * }
 * ```
 */
export type RemoveUrlsFromCustomProjectCommand = {
  readonly projectId: string
  readonly urls: readonly string[]
}

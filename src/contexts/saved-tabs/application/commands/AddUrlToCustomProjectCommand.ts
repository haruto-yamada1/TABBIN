/**
 * `AddUrlToCustomProjectUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleAddUrlToProject` が
 * `CustomProjectsCommandService.addUrlToCustomProject` を直接呼んでいた
 * 経路を application use-case へ移設する。`notes` / `category` は
 * `lib/storage/projects.addUrlToCustomProject` と同じ optional 引数で
 * 保存時の metadata として反映される。
 *
 * @example
 * ```ts
 * const command: AddUrlToCustomProjectCommand = {
 *   projectId: 'project-1',
 *   title: 'Example',
 *   url: 'https://example.com/a',
 * }
 * ```
 */
export type AddUrlToCustomProjectCommand = {
  readonly projectId: string
  readonly title: string
  readonly url: string
  readonly notes?: string
  readonly category?: string
}

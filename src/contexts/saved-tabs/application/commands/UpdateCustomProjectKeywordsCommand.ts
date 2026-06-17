import type { ProjectKeywordSettings } from '@/types/storage'

/**
 * `UpdateCustomProjectKeywordsUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleUpdateProjectKeywords` が
 * `CustomProjectsCommandService.updateProjectKeywords` を直接呼んでいた
 * 経路を application use-case へ移設する。`projectKeywords` は
 * title / URL / domain 自動振り分け用のキーワード設定。
 *
 * @example
 * ```ts
 * const command: UpdateCustomProjectKeywordsCommand = {
 *   projectId: 'project-1',
 *   projectKeywords: {
 *     titleKeywords: ['docs'],
 *     urlKeywords: ['example'],
 *     domainKeywords: ['example.com'],
 *   },
 * }
 * ```
 */
export interface UpdateCustomProjectKeywordsCommand {
  readonly projectId: string
  readonly projectKeywords: ProjectKeywordSettings
}

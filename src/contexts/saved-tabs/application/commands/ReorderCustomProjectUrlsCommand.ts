/**
 * `ReorderCustomProjectUrlsUseCase` の入力 (issue #539)。
 *
 * 旧 `useProjectManagement.handleReorderUrls` が
 * `CustomProjectsCommandService.reorderProjectUrls` を直接呼んでいた
 * 経路を application use-case へ移設する。`urls` は新しい URL 順序
 * 配列。`lib/storage/projects.reorderProjectUrls` の引数 shape を
 * そのまま domain 境界へ持ち込まず、`@/types/storage` の
 * `CustomProject['urls']` を契約として使う (issue #511)。
 *
 * @example
 * ```ts
 * const command: ReorderCustomProjectUrlsCommand = {
 *   projectId: 'project-1',
 *   urls: [{ title: 'B', url: 'https://example.com/b' }],
 * }
 * ```
 */
import type { ResolvedCustomProjectUrlDto } from '@/contexts/saved-tabs/application/dto/ResolvedCustomProjectUrlDto'

export type ReorderCustomProjectUrlsCommand = {
  readonly projectId: string
  readonly urls: readonly ResolvedCustomProjectUrlDto[]
}

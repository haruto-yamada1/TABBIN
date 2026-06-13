import type { TabGroup } from '../entities/TabGroup'
import type { TabGroupId } from '../value-objects/TabGroupId'

/**
 * `TabGroup` の永続化責務だけを抽出した repository interface。
 *
 * `src/contexts/saved-tabs/domain/repositories/` 配下に interface のみを置き、
 * 実装（`chrome.storage.local` / IndexedDB / メモリなど）は
 * `src/contexts/saved-tabs/infrastructure/persistence/` 側で提供する。
 *
 * ルール:
 * - この interface は `chrome.*` API を知らない。
 * - `findAll` / `findById` / `saveAll` / `removeByIds` の 4 操作だけを公開し、
 *   ビジネスロジック（URL 追加、並び替え、サブカテゴリ付けなど）は
 *   use-case / domain service 側に寄せる。
 * - 返り値は `readonly` 修飾し、取得側で破壊的変更を許さない。
 *
 * @example
 * ```ts
 * const groups = await tabGroupRepository.findAll()
 * const target = groups.find((group) => group.domain === 'example.com')
 * ```
 */
export interface TabGroupRepository {
  findAll: () => Promise<readonly TabGroup[]>
  findById: (id: TabGroupId) => Promise<TabGroup | null>
  saveAll: (groups: readonly TabGroup[]) => Promise<void>
  removeByIds: (ids: readonly TabGroupId[]) => Promise<void>
}

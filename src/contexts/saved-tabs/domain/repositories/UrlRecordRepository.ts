import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `UrlRecord` の永続化責務だけを抽出した repository interface。
 *
 * Issue #457 の例として提示された 4 操作（`findAll` / `findById` / `saveAll` /
 * `removeByIds`）を最小単位とし、business rule（重複統合、未参照掃除、
 * 参照整合性の確認など）は `domain/services/` と use-case 側に閉じる。
 *
 * `chrome.storage.local` の直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * @example
 * ```ts
 * const records = await urlRecordRepository.findAll()
 * const target = records.find((record) => record.url === 'https://example.com')
 * ```
 */
export interface UrlRecordRepository {
  findAll: () => Promise<readonly UrlRecord[]>
  findById: (id: UrlRecordId) => Promise<UrlRecord | null>
  saveAll: (records: readonly UrlRecord[]) => Promise<void>
  removeByIds: (ids: readonly UrlRecordId[]) => Promise<void>
}

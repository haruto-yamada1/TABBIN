import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `DeleteSavedUrlUseCase` の結果 DTO。
 *
 * `removedUrlRecordId` は実際に `UrlRecordRepository.removeByIds` で
 * 削除された `UrlRecordId`（他で参照されていなければ削除される）。
 * 他で参照されているために `UrlRecord` が残った場合は `null` を返す。
 *
 * `removedTabGroupId` は対象 `TabGroup` の ID。`urlIds` 配列から
 * 該当 `UrlRecordId` を取り除いた結果 `TabGroup` が空になった場合は
 * その `TabGroup` 自体が削除される。`null` の場合は `TabGroup` が
 * 残ったことを示す。
 *
 * `snapshot` は Undo 用。`savedTabs` には対象 `TabGroup` の
 * 削除前スナップショットを、`urlRecords` には実際に削除された
 * `UrlRecord` の配列を格納する。1 件も削除されなかったケースでは `null`。
 */
export interface DeletedSavedUrlDto {
  readonly removedUrlRecordId: UrlRecordId | null
  readonly removedTabGroupId: TabGroup['id'] | null
  readonly removedUrlRecord: UrlRecord | null
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}

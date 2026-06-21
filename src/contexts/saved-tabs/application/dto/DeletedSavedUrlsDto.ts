import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `DeleteSavedUrlsUseCase` の結果 DTO。
 *
 * `removedUrlRecordIds` は実際に削除された `UrlRecordId` 配列
 * （他で参照されていなければ削除される）。他で参照されている
 * ために `UrlRecord` が残った場合は `removedUrlRecordIds` には
 * 含まれない。
 *
 * `removedUrlRecords` は実際に削除された `UrlRecord` の配列。
 * Undo 時に「消した UrlRecord を戻す」用途に使う。
 *
 * `removedTabGroupIds` は対象 `TabGroup` のうち、`urlIds` 配列から
 * 該当 `UrlRecordId` をすべて取り除いた結果空になって削除されたもの。
 * `TabGroup` が残った場合はその ID は含まれない。
 *
 * `snapshot` は Undo 用。`savedTabs` には削除された `TabGroup` の
 * 削除前スナップショットを、`urlRecords` には実際に削除された
 * `UrlRecord` の配列を格納する。1 件も削除されなかったケースでは `null`。
 */
export interface DeletedSavedUrlsDto {
  readonly removedUrlRecordIds: readonly UrlRecordId[]
  readonly removedUrlRecords: readonly UrlRecord[]
  readonly removedTabGroupIds: readonly TabGroup['id'][]
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}

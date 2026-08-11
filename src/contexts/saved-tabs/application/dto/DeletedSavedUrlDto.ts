import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'

import type { SavedTabsUrlRecordDto } from './SavedTabsPresentationDto'

/**
 * `DeleteSavedUrlUseCase` の結果 DTO。
 *
 * `removedUrlRecordId` は実際に `UrlRecordRepository.removeByIds` で
 * 削除された `UrlRecordId`（他で参照されていなければ削除される）。
 * 他で参照されているために `UrlRecord` が残った場合は `null` を返す。
 *
 * `removedTabGroupId` は対象 `TabGroup` の ID。`memberships` から
 * 該当 `UrlRecordId` を取り除いた結果 `TabGroup` が空になった場合は
 * その `TabGroup` 自体が削除される。`null` の場合は `TabGroup` が
 * 残ったことを示す。
 *
 * `snapshot` は Undo 用。`savedTabs` には対象 `TabGroup` の
 * 削除前スナップショットを、`urlRecords` には実際に削除された
 * `UrlRecord` の配列を格納する。1 件も削除されなかったケースでは `null`。
 */
export type DeletedSavedUrlDto = {
  readonly removedUrlRecordId: string | null
  readonly removedTabGroupId: string | null
  readonly removedUrlRecord: SavedTabsUrlRecordDto | null
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}

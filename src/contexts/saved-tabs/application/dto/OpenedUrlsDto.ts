import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'

import type { SavedTabsUrlRecordDto } from './SavedTabsPresentationDto'

/**
 * `OpenAllSavedUrlsUseCase` の結果 DTO。
 *
 * `openedUrls` は実際にブラウザで開いた URL 文字列配列。
 * `removedUrlRecordIds` は `removeTabAfterOpen` 設定と
 * 参照関係（他で参照されているか）に基づいて削除された
 * `UrlRecordId` 集合。空配列なら「削除されなかった」ことを示す。
 *
 * `removedUrlRecords` は実際に `UrlRecordRepository.removeByIds` で
 * 削除された `UrlRecord` の配列。Undo 時に「消した UrlRecord を戻す」用途に使う。
 *
 * `snapshot` は `RestoreOpenedUrlsSnapshotCommand` へそのまま渡せる形。
 * 削除が発生しなかったケースでは `null`。
 */
export type OpenedUrlsDto = {
  readonly openedUrls: readonly string[]
  readonly removedUrlRecordIds: readonly string[]
  readonly removedUrlRecords: readonly SavedTabsUrlRecordDto[]
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}

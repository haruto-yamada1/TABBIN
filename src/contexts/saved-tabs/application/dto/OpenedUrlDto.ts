import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'

import type { SavedTabsUrlRecordDto } from './SavedTabsPresentationDto'

/**
 * `OpenSavedUrlUseCase` の結果 DTO。
 *
 * `openedUrl` は実際にブラウザで開いた URL 文字列（`BrowserTabPort` の
 * 戻り値）。`removedUrlRecordId` は設定と origin に応じて削除された
 * URL レコードの ID（削除されなかった場合は `null`）。
 *
 * `removedUrlRecordId` を `null` 許容にすることで、「設定 OFF で
 * 何も消さなかった」「設定 ON だが他で参照されているので消さなかった」
 * ケースを 1 つの型で表現する。UI 側のトースト文言分岐に使う。
 *
 * `openedUrl` は `Url` 値オブジェクトではなく素の `string` にする。
 * port 戻り値が `string` であり、presentation 側で再パースして
 * 値オブジェクト化する責務を presentation に寄せたいため。
 */
export type OpenedUrlDto = {
  readonly openedUrl: string
  readonly removedUrlRecordId: string | null
  /**
   * 開いた URL がどの `UrlRecord` だったか。Undo 時の
   * 「どの `UrlRecord` を戻すか」識別に使う。
   */
  readonly removedUrlRecord: SavedTabsUrlRecordDto | null
  /**
   * Undo 用の snapshot。`DeleteTabGroupDto` と同じく
   * `RestoreOpenedUrlsSnapshotCommand` へそのまま渡せる形。
   * 削除が発生しなかったケースでは `null`。
   */
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `DeleteTabGroupsUseCase` の結果 DTO。
 *
 * 削除成功時のみ返る。Undo に必要なデータを `snapshot` にまとめ、
 * presentation 層が `RestoreOpenedUrlsSnapshotUseCase` へそのまま渡せる
 * 形にしてある。
 *
 * `removedTabGroupIds` は実際に削除された TabGroup の ID 配列。
 * 入力で指定した `tabGroupIds` のうち、storage 上に存在しなかったものは
 * 含まれない（filter 結果）。
 *
 * `removedUrlRecordIds` は削除された TabGroup に属していた `UrlRecord` の
 * うち、削除後にどの TabGroup / CustomProject からも参照されなくなった
 * もの。空配列なら「他で参照されていたため UrlRecord は保持された」ことを示す。
 */
export interface DeletedTabGroupsDto {
  readonly removedTabGroupIds: readonly TabGroupId[]
  readonly removedUrlRecordIds: readonly UrlRecordId[]
  /**
   * 復元に必要なスナップショット。
   * presentation 層が Undo を発火する際に `RestoreOpenedUrlsSnapshotCommand`
   * へそのまま渡せる形。
   */
  readonly snapshot: OpenedUrlsRestoreSnapshot & {
    readonly savedTabs: readonly TabGroup[]
  }
}

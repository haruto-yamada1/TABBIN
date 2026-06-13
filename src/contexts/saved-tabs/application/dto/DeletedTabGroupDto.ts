import type { TabGroup } from '../../domain/entities/TabGroup'
import type { UrlRecordId } from '../../domain/value-objects/UrlRecordId'
import type { OpenedUrlsRestoreSnapshot } from '../commands/RestoreOpenedUrlsSnapshotCommand'

/**
 * `DeleteTabGroupUseCase` の結果 DTO。
 *
 * 削除成功時のみ返る。Undo に必要なデータを `snapshot` にまとめ、
 * presentation 層が `RestoreOpenedUrlsSnapshotUseCase` へそのまま渡せる
 * 形にしてある。
 *
 * `removedTabGroupId` は Undo トーストに件数表示を出すために使う。
 * `removedUrlRecordIds` は実際に削除された `UrlRecord` の ID 集合で、
 * UI で「他で参照されていなかった URL が N 件削除されました」を
 * 表示する用途を想定。
 */
export interface DeletedTabGroupDto {
  readonly removedTabGroupId: TabGroup['id']
  /**
   * 削除対象 TabGroup 内に含まれていた URL のうち、削除後に
   * どの TabGroup / CustomProject からも参照されなくなった `UrlRecordId`。
   * 空集合なら「他で参照されていたため UrlRecord は保持された」ことを示す。
   */
  readonly removedUrlRecordIds: readonly UrlRecordId[]
  /**
   * 復元に必要なスナップショット。
   * presentation 層が Undo を発火する際に `RestoreOpenedUrlsSnapshotCommand`
   * へそのまま渡せる形。
   */
  readonly snapshot: OpenedUrlsRestoreSnapshot
}

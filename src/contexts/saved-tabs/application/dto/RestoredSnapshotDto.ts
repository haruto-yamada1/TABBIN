import type { CustomProject } from '../../domain/entities/CustomProject'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { UrlRecord } from '../../domain/entities/UrlRecord'

/**
 * `RestoreOpenedUrlsSnapshotUseCase` の結果 DTO。
 *
 * 復元が部分的にしか行えなかった場合（例: 渡された `TabGroup` の ID が
 * 既に他の `TabGroup` と衝突する）を表現するため、各フィールドを
 * optional にしてある。presentation 層は件数だけ表示するか、
 * 個別に成功 / 失敗を通知するかを選べる。
 */
export interface RestoredSnapshotDto {
  readonly restoredTabGroups: readonly TabGroup[]
  readonly restoredUrlRecords: readonly UrlRecord[]
  readonly restoredCustomProjects: readonly CustomProject[]
  readonly restoredParentCategories: readonly ParentCategory[]
}

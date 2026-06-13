import type { CustomProject } from '../../domain/entities/CustomProject'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { UrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectId } from '../../domain/value-objects/CustomProjectId'

/**
 * `RestoreOpenedUrlsSnapshotUseCase` の結果 DTO。
 *
 * 復元が部分的にしか行えなかった場合（例: 渡された `TabGroup` の ID が
 * 既に他の `TabGroup` と衝突する）を表現するため、各フィールドを
 * optional にしてある。presentation 層は件数だけ表示するか、
 * 個別に成功 / 失敗を通知するかを選べる。
 *
 * `restoredCustomProjectOrder` は snapshot に `customProjectOrder` が
 * 含まれていたときだけ値を返し、未指定なら `undefined` のまま。
 * 既存データ（`order` 未保存の snapshot）と後方互換を保つため、
 * 必須フィールドにはしない。
 */
export interface RestoredSnapshotDto {
  readonly restoredTabGroups: readonly TabGroup[]
  readonly restoredUrlRecords: readonly UrlRecord[]
  readonly restoredCustomProjects: readonly CustomProject[]
  readonly restoredParentCategories: readonly ParentCategory[]
  readonly restoredCustomProjectOrder?: readonly CustomProjectId[]
}

import type {
  SavedTabsCustomProjectDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
} from './SavedTabsPresentationDto'

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
export type RestoredSnapshotDto = {
  readonly restoredTabGroups: readonly SavedTabsTabGroupDto[]
  readonly restoredUrlRecords: readonly SavedTabsUrlRecordDto[]
  readonly restoredCustomProjects: readonly SavedTabsCustomProjectDto[]
  readonly restoredParentCategories: readonly SavedTabsParentCategoryDto[]
  readonly restoredCustomProjectOrder?: readonly string[]
}

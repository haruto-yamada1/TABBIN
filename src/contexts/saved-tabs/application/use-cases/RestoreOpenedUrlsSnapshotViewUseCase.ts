import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import {
  getSnapshotSavedTabs,
  toStorageCustomProjects,
  toStorageParentCategories,
  toRestoreOpenedUrlsSnapshotCommand,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { CustomProject, ParentCategory, TabGroup } from '@/types/storage'

import type { RestoreOpenedUrlsSnapshotUseCase } from './RestoreOpenedUrlsSnapshotUseCase'

/**
 * `RestoreOpenedUrlsSnapshotViewUseCase` の結果 DTO。
 *
 * `application/mappers/SavedTabsSnapshotMapper` 経由で domain entity 形
 * snapshot を storage 形配列へ変換した payload を保持する。
 * `customProjects` / `parentCategories` は snapshot に対応するフィールドが
 * 存在しないとき `undefined` を維持し、UI が意図せず「空配列で全消し」
 * しないよう presenter 層に通知する (issue #512)。
 */
export interface RestoredSnapshotViewDto {
  readonly customProjects?: readonly CustomProject[]
  readonly parentCategories?: readonly ParentCategory[]
  readonly savedTabs: readonly TabGroup[]
}

/**
 * `RestoreOpenedUrlsSnapshotViewUseCase` が依存する use-case 群。
 *
 * 既存の `RestoreOpenedUrlsSnapshotUseCase` へ委譲しつつ、
 * `application/mappers` 経由で snapshot 内の domain entity を
 * storage 形に詰め替えることで、presentation 層が mapper の役割を
 * helper 側に持たなくて済むようにする (issue #512)。
 */
export interface RestoreOpenedUrlsSnapshotViewUseCaseDeps {
  readonly restoreOpenedUrlsSnapshot: RestoreOpenedUrlsSnapshotUseCase
}

/**
 * `RestoreOpenedUrlsSnapshotViewUseCase` の関数型。
 *
 * snapshot を受け取り、内部で `restoreOpenedUrlsSnapshot` を呼び、
 * presentation 層が `setCustomProjects` / `setCategories` / `refreshTabGroupsWithUrls`
 * に直接渡せる形 (`storage 形 CustomProject[]` / `ParentCategory[]` /
 * `TabGroup[]`) を `RestoredSnapshotViewDto` として返す。
 */
export type RestoreOpenedUrlsSnapshotViewUseCase = (command: {
  snapshot: OpenedUrlsRestoreSnapshot
}) => Promise<RestoredSnapshotViewDto>

/**
 * `RestoreOpenedUrlsSnapshotViewUseCase` を生成する。
 *
 * 責務 (issue #512):
 * 1. `RestoreOpenedUrlsSnapshotUseCase` へ snapshot をそのまま渡す
 *    (storage への書き戻しは use-case 側に委譲する)。
 * 2. `SavedTabsSnapshotMapper` 経由で snapshot 内の domain entity を
 *    storage 形配列へ変換し、UI state 反映用 payload として返す。
 *    `customProjects` / `parentCategories` が `undefined` のときは
 *    `undefined` 維持とする (presentation 層が「空配列で全消し」しない
 *    よう意図的にマージしない)。
 */
export const createRestoreOpenedUrlsSnapshotViewUseCase = (
  deps: RestoreOpenedUrlsSnapshotViewUseCaseDeps,
): RestoreOpenedUrlsSnapshotViewUseCase => {
  return async (command) => {
    await deps.restoreOpenedUrlsSnapshot(
      toRestoreOpenedUrlsSnapshotCommand(command.snapshot),
    )
    return {
      customProjects: toStorageCustomProjects(command.snapshot),
      parentCategories: toStorageParentCategories(command.snapshot),
      savedTabs: getSnapshotSavedTabs(command.snapshot),
    }
  }
}

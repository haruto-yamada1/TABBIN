import type { BuildSavedTabsSnapshotCommand } from '@/contexts/saved-tabs/application/commands/BuildSavedTabsSnapshotCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import {
  toSavedTabsCustomProjectDto,
  toSavedTabsParentCategoryDto,
  toSavedTabsTabGroupDto,
  toSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

/**
 * `BuildSavedTabsSnapshotUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 *
 * `urlRecordRepository` は Undo 時に削除された `UrlRecord` を復元するため
 * 必須 (Codex レビュー対応: P1 / issue #494)。
 */
export interface BuildSavedTabsSnapshotUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly urlRecordRepository: UrlRecordRepository
}

/**
 * `BuildSavedTabsSnapshotUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type BuildSavedTabsSnapshotUseCase = (
  command: BuildSavedTabsSnapshotCommand,
) => Promise<OpenedUrlsRestoreSnapshot>

/**
 * `BuildSavedTabsSnapshotUseCase` を生成する。
 *
 * 責務:
 * 1. `TabGroupRepository` / `CustomProjectRepository` /
 *    `ParentCategoryRepository` から Undo 復元に必要なデータを取得する。
 * 2. `command.parentCategories` が指定されていればそれを採用する
 *    （UI state の編集済みカテゴリを優先するシナリオ用）。
 *    未指定なら `ParentCategoryRepository` から取得した集合を使う。
 * 3. 取得結果を `OpenedUrlsRestoreSnapshot` 形にまとめて返す。
 *
 * 復元先（`RestoreOpenedUrlsSnapshotUseCase`）は各フィールドを
 * 「ID ベースのマージ」または「全置換」で扱うので、snapshot に
 * どの範囲を含めるかは呼び出し側の判断に委ねる。本 use-case は
 * 「現 storage のフルコピー + UI state での編集上書き」を提供する
 * 最小 API とする（issue #494）。
 */
export const createBuildSavedTabsSnapshotUseCase = (
  deps: BuildSavedTabsSnapshotUseCaseDeps,
): BuildSavedTabsSnapshotUseCase => {
  return async (command) => {
    const [
      tabGroups,
      customProjects,
      customProjectOrder,
      storedCategories,
      urlRecords,
    ] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.customProjectRepository.findAll(),
      deps.customProjectRepository.findOrder(),
      deps.parentCategoryRepository.findAll(),
      deps.urlRecordRepository.findAll(),
    ])
    const parentCategories =
      command.parentCategories ??
      storedCategories.map(toSavedTabsParentCategoryDto)
    return {
      customProjectOrder: customProjectOrder.map(String),
      customProjects: customProjects.map(toSavedTabsCustomProjectDto),
      parentCategories: [...parentCategories],
      savedTabs: tabGroups.map(toSavedTabsTabGroupDto),
      urlRecords: urlRecords.map(toSavedTabsUrlRecordDto),
    }
  }
}

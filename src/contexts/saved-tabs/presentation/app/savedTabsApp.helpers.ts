import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'

/**
 * `savedTabsApp.helpers.ts` の最終整理 (issue #512)。
 *
 * 旧ファイルは `Undo / snapshot変換` / `customProjects URL削除` /
 * `category sync` / `URL削除対象算出` / `navigation sync` / `UI 都合の
 * 整形` を全部抱えていたため、責務を application / domain / presentation の
 * 適切なレイヤへ分割した。
 *
 * このファイルは **presentation 層からの re-export 集約点** としてのみ
 * 残し、UI 整形・view バインド専用の薄いヘルパーだけを再公開する。
 *
 * 移設先:
 * - snapshot 変換 / domain ↔ storage マッピング →
 *   `@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper`
 * - Undo 復元 + storage 形 payload 変換 →
 *   `@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotViewUseCase`
 * - customProjects URL 削除 →
 *   `@/contexts/saved-tabs/application/use-cases/RemoveUrlsFromCustomProjectsUseCase`
 * - view mode の URL 同期 / href 解決 →
 *   `@/contexts/saved-tabs/presentation/services/viewModeNavigationService`
 * - Undo トースト / 削除失敗通知 →
 *   `@/contexts/saved-tabs/presentation/services/savedTabsUndoNotificationService`
 * - TabGroup / カテゴリ同期 state 整形 →
 *   `@/contexts/saved-tabs/presentation/lib/tab-group-state`
 */

export {
  buildUpdatedGroupAfterUrlIdRemoval,
  buildUrlIdsToRemove,
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  filterGroupsByExcludedIds,
  removeUrlIdsFromSavedTabs,
  syncGroupCategoryAssignment,
  updateSavedTabParentCategory,
} from '@/contexts/saved-tabs/presentation/lib/tab-group-state'
export type { CategorySyncState } from '@/contexts/saved-tabs/presentation/lib/tab-group-state'

export {
  resolveSavedTabsViewModeHref,
  shouldWaitForInitialViewMode,
  syncSavedTabsViewModeLocation,
} from '@/contexts/saved-tabs/presentation/services/viewModeNavigationService'

export {
  notifyDeleteFailure,
  showOpenedUrlsUndoToast,
} from '@/contexts/saved-tabs/presentation/services/savedTabsUndoNotificationService'
export type {
  NotifyDeleteFailureParams,
  ShowOpenedUrlsUndoToastParams,
} from '@/contexts/saved-tabs/presentation/services/savedTabsUndoNotificationService'

export {
  getSnapshotSavedTabs,
  toDomainParentCategories,
  toDomainTabGroupsForReorder,
  toStorageCustomProject,
  toStorageParentCategory,
  toStorageTabGroup,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'

/**
 * `BuildSavedTabsSnapshotUseCase` 由来の `OpenedUrlsRestoreSnapshot` を
 * presentation 層で扱うための alias。旧 `OpenedUrlsStorageSnapshot` と同じ
 * 用途で、復元経路（Undo）とスナップショット捕捉（use-case）の
 * インターフェースが一致するようになった (issue #494)。
 *
 * `application/mappers/SavedTabsSnapshotMapper` 経由で domain entity 形
 * snapshot を storage 形へ変換するため、presentation helper としては
 * 型の re-export だけに閉じる。
 */
type OpenedUrlsStorageSnapshot = OpenedUrlsRestoreSnapshot

export type { OpenedUrlsStorageSnapshot }

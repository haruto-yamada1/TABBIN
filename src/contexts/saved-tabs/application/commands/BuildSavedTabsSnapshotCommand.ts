import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/**
 * `BuildSavedTabsSnapshotUseCase` の入力。
 *
 * 削除 / 一括オープンなどの Undo 用 snapshot を presentation 層が
 * 組み立てるために使う。`parentCategories` は UI state（`useCategoryManagement`）
 * から渡される編集済みカテゴリ集合を許容し、未指定なら storage から
 * 取得する。
 *
 * 旧 `SavedTabsApp.tsx` の `chrome.storage.local.get([...])` を
 * repository 経由へ移す目的（issue #494）。
 */
export interface BuildSavedTabsSnapshotCommand {
  readonly parentCategories?: readonly SavedTabsParentCategoryDto[]
}

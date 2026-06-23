import type {
  SavedTabsCustomProjectDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/**
 * `RestoreOpenedUrlsSnapshotUseCase` の入力。
 *
 * 「開いたあとに削除された URL を Undo で戻す」シナリオのため、
 * `DeleteTabGroupUseCase` / `OpenSavedUrlUseCase` の結果 DTO が
 * この形に変換されて渡される。
 *
 * 全フィールド optional とし、snapshot が部分的にしか残っていない
 * ケース（例: `customProjects` だけ未保存）でも安全に復元できるようにする。
 *
 * @example
 * ```ts
 * await restoreOpenedUrlsSnapshotUseCase({
 *   snapshot: {
 *     savedTabs: previousTabGroups,
 *     urlRecords: previousUrlRecords,
 *   },
 * })
 * ```
 */
export interface OpenedUrlsRestoreSnapshot {
  readonly savedTabs?: readonly SavedTabsTabGroupDto[]
  readonly urlRecords?: readonly SavedTabsUrlRecordDto[]
  readonly customProjects?: readonly SavedTabsCustomProjectDto[]
  readonly customProjectOrder?: readonly string[]
  readonly parentCategories?: readonly SavedTabsParentCategoryDto[]
}

/**
 * `RestoreOpenedUrlsSnapshotUseCase` の入力。
 *
 * snapshot は use-case の DTO から渡されることを想定。UI 側で
 * 「Undo」ボタンを押す前に `useState` などで保持しておく。
 */
export interface RestoreOpenedUrlsSnapshotCommand {
  readonly snapshot: OpenedUrlsRestoreSnapshot
}

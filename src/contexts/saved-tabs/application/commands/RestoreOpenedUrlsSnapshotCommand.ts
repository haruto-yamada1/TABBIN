import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

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
  readonly savedTabs?: readonly TabGroup[]
  readonly urlRecords?: readonly UrlRecord[]
  readonly customProjects?: readonly CustomProject[]
  readonly customProjectOrder?: readonly string[]
  readonly parentCategories?: readonly ParentCategory[]
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

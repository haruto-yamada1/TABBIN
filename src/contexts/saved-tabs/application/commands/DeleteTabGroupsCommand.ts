import type { TabGroupId } from '../../domain/value-objects/TabGroupId'

/**
 * `DeleteTabGroupsUseCase` の入力。
 *
 * 既存 `SavedTabsApp.tsx` の `handleDeleteGroups` 相当の責務を
 * 1 つの use-case にまとめる。複数の `TabGroupId` を一括で受け取り、
 * 1 件も対象がない場合は no-op として扱う。
 *
 * 単一の `DeleteTabGroupUseCase` と API シグネチャを揃えるため、
 * `tabGroupIds` 配列は空でも許可する（use-case 側で早期 return する）。
 *
 * @example
 * ```ts
 * const command: DeleteTabGroupsCommand = {
 *   tabGroupIds: [tabGroupId1, tabGroupId2],
 * }
 * const result = await deleteTabGroupsUseCase(command)
 * ```
 */
export interface DeleteTabGroupsCommand {
  readonly tabGroupIds: readonly TabGroupId[]
}

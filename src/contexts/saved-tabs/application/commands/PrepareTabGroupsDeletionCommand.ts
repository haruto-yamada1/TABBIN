/**
 * `PrepareTabGroupsDeletionUseCase` の入力。
 *
 * 複数 `TabGroup` 削除前に走らせる application 側副作用
 * (`CategoriesCommandService.updateDomainCategorySettings` /
 * 親カテゴリ `domainNames` への `domain` 追加 /
 * `DomainCategoryMapping` の差し替え) を一括で集約する use-case の
 * command (issue #524)。
 *
 * 単数の `PrepareTabGroupDeletionCommand` とは責務が異なる:
 * - 本 command は **複数 `TabGroupId` を一括**で扱い、
 *   旧 `tab-operations.handleTabGroupRemoval` を `Promise.all` で
 *   並列実行していた挙動を use-case 側に閉じ込める。
 * - `tabGroupIds` が空配列の場合は no-op。
 * - 単一 ID だけ渡せば `PrepareTabGroupDeletionUseCase` と等価だが、
 *   `SavedTabsApp.handleDeleteGroups` 側の bulk 経路を分離するため
 *   command を分けて presenter の意図を明確化する。
 *
 * 削除本体は `DeleteTabGroupsUseCase` 側が担うため本 use-case には
 * 含めない。
 *
 * @example
 * ```ts
 * const command: PrepareTabGroupsDeletionCommand = {
 *   tabGroupIds: ['tab-1', 'tab-2'] as unknown as TabGroupId[],
 * }
 * ```
 */
export interface PrepareTabGroupsDeletionCommand {
  readonly tabGroupIds: readonly string[]
}

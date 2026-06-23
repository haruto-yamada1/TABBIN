/**
 * `PrepareTabGroupDeletionUseCase` の入力。
 *
 * 単一の `TabGroup` 削除前に走らせる application 側副作用
 * (`CategoriesCommandService.updateDomainCategorySettings` /
 * 親カテゴリ `domainNames` への `domain` 追加 /
 * `DomainCategoryMapping` の差し替え) を集約する use-case の
 * command (issue #524)。
 *
 * presentation 側 (`SavedTabsApp.handleDeleteGroup`) から渡される
 * ID は storage 形の `string` であり、application 層で
 * `TabGroupId` ブランドへ widening する既存 convention に揃える。
 *
 * 削除本体 (savedTabs / urlRecords の掃除) は
 * `DeleteTabGroupUseCase` 側が担うため、本 use-case には
 * 含めない。削除順序は呼び出し側で
 * 1. `PrepareTabGroupDeletionUseCase` (本 use-case)
 * 2. `DeleteTabGroupUseCase`
 * 3. `RemoveUrlsFromCustomProjectsUseCase`
 * 4. `RemoveDomainsFromParentCategoriesUseCase`
 * の順で実行する。
 *
 * @example
 * ```ts
 * const command: PrepareTabGroupDeletionCommand = {
 *   tabGroupId: 'tab-1' as unknown as TabGroupId,
 * }
 * ```
 */
export interface PrepareTabGroupDeletionCommand {
  readonly tabGroupId: string
}

import type { TabGroupId } from '../../domain/value-objects/TabGroupId'

/**
 * `RemoveDomainsFromParentCategoriesCommand` の入力。
 *
 * 親カテゴリの `domains` (TabGroupId 配列) から指定の `TabGroupId` を
 * 取り除く。1 つの command で複数 `TabGroupId` を扱える bulk 版で、
 * `SavedTabsApp` の単一 / 一括 TabGroup 削除後に共通で使われる。
 *
 * `RemoveDomainFromParentCategoryCommand` (旧: 1 件 + domainName まで扱う
 * specific category 単位) とは責務が異なる:
 * - 本 command は **全 `ParentCategory` を横断** して `TabGroupId` だけを
 *   取り除く。`domainNames` は変更しない (旧 `removeDomainFromParentCategories`
 *   の挙動を踏襲する)。
 * - category 単位の完全削除 (categoryId 指定 + domainName 同期削除) は
 *   `RemoveDomainFromParentCategoryUseCase` 側に残す。
 *
 * 該当 ID がどのカテゴリにも含まれていなくても no-op として成功する
 * (旧 `removeDomainFromParentCategories` の挙動と一致)。
 *
 * @example
 * ```ts
 * const command: RemoveDomainsFromParentCategoriesCommand = {
 *   domainIds: ['tab-1', 'tab-2'] as unknown as TabGroupId[],
 * }
 * ```
 */
export interface RemoveDomainsFromParentCategoriesCommand {
  readonly domainIds: readonly TabGroupId[]
}

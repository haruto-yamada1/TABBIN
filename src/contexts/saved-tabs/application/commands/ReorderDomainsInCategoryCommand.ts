import type { TabGroup } from '@/types/storage'

/**
 * `ReorderDomainsInCategoryUseCase` の入力 (issue #525)。
 *
 * UI 側の `useCategoryManagement.handleUpdateDomainsOrder` から
 * presentation 層で組み立てて use-case へ渡す。`domainIds` への
 * 変換（`TabGroup` -> `TabGroupId`）は use-case 側で行う。
 *
 * @example
 * ```ts
 * const command: ReorderDomainsInCategoryCommand = {
 *   categoryId: 'cat-docs',
 *   updatedDomains: [group2, group1, group3],
 * }
 * ```
 */
export interface ReorderDomainsInCategoryCommand {
  /** 並び替え対象カテゴリの `ParentCategoryId`。 */
  readonly categoryId: string
  /**
   * UI 側で並び替えたあとの `TabGroup` 配列。
   *
   * `TabGroup.id` (`TabGroupId`) を取り出して `domainIds` へ変換した
   * 上で domain service へ渡す。
   */
  readonly updatedDomains: readonly TabGroup[]
}

/**
 * `MoveDomainBetweenCategoriesUseCase` の入力 (issue #525)。
 *
 * UI 側の `useCategoryManagement.handleMoveDomainToCategory` から
 * presentation 層で組み立てて use-case へ渡す。`tabGroups` は
 * `tabGroupId` -> `TabGroup.domain` の引き当てにだけ使い、ドメイン
 * 順序更新や `chrome.storage.local` への永続化は use-case 側に閉じる。
 *
 * `domainId` は `TabGroup.id` と同じく生文字列で受け付ける。storage
 * 層の `TabGroup` は branded ではないため、UI 側の string id を
 * そのまま渡して use-case 内で `TabGroupId` / `DomainName` へ
 * widening する設計としている。
 *
 * @example
 * ```ts
 * const command: MoveDomainBetweenCategoriesCommand = {
 *   domainId: 'tab-1',
 *   fromCategoryId: 'cat-docs',
 *   tabGroups: [group1, group2],
 *   toCategoryId: 'cat-news',
 * }
 * ```
 */
import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export type MoveDomainBetweenCategoriesCommand = {
  /** 移動する `TabGroupId`（生文字列）。 */
  readonly domainId: string
  /**
   * 移動元カテゴリの `ParentCategoryId`。
   * 未分類（どのカテゴリにも属さない）からの移動は `null`。
   */
  readonly fromCategoryId: string | null
  /**
   * UI 側が保持する `TabGroup` スナップショット。
   *
   * domain service の `moveDomainBetweenCategories` 自体は
   * `domainId` / `domainName` 確定後の純粋な配列変換のみを担うため、
   * `tabGroups` は `domainId` 一致で `domainName` を引くためにだけ
   * 使用する。
   */
  readonly tabGroups: readonly TabGroup[]
  /** 移動先カテゴリの `ParentCategoryId`。 */
  readonly toCategoryId: string
}

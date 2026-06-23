/**
 * presentation 層が `parentCategoryRepository.saveAll` /
 * `tabGroupRepository.saveAll` を直接呼ばずにカテゴリ / タブグループ配列を
 * 永続化するための薄い port ファサード (issue #510)。
 *
 * 背景:
 * - `useCategoryManagement` / `useDomainCardState` /
 *   `useCategoryKeywordModal` / `SavedTabsApp` など、 presentation 層には
 *   「カテゴリ並び替え」「カテゴリ内ドメイン並び替え」「キーワード
 *   削除時の TabGroup 書き戻し」など、複数の storage key を跨ぐ副作用が
 *   集中する。
 * - これらは entity バリデーションが緩く、専用 use-case 化すると
 *   過剰な抽象化になる。repository 直叩き (issue #502) も
 *   presentation 層から chrome.* を撤去する方針に合わない。
 * - そこで本 port を 1 つ導入し、application 層境界を維持したまま
 *   `saveAll` 相当の永続化を port メソッドへ閉じ込める。
 *
 * 実装は `infrastructure/composition/LibCategoryAssignmentPort.ts` が
 * 既存 `parentCategoryRepository` / `tabGroupRepository` へ委譲する
 * thin facade として提供する。
 */
import type {
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/**
 * `CategoryAssignmentPort` 関数定義。
 *
 * `saveParentCategories` / `saveTabGroups` は domain entity (`ParentCategory`
 * / `TabGroup`) の配列を永続化する。entity バリデーションや storage shape
 * への写像は実装側に閉じ込め、presentation 層は配列をそのまま渡せる。
 */
export interface CategoryAssignmentPort {
  /**
   * 旧 `@/lib/storage/categories.saveParentCategories` の port 版。
   * `parentCategoryRepository.saveAll` へ委譲する薄いラッパ。
   */
  readonly saveParentCategories: (
    categories: readonly SavedTabsParentCategoryDto[],
  ) => Promise<void>
  /**
   * 旧 `@/lib/storage/tabs` 系の `TabGroup[]` 永続化 port 版。
   * `tabGroupRepository.saveAll` へ委譲する薄いラッパ。
   */
  readonly saveTabGroups: (
    tabGroups: readonly SavedTabsDisplayTabGroupDto[],
  ) => Promise<void>
}

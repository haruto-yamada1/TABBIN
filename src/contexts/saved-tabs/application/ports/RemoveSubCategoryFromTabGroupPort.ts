/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の依存 port (issue #519)。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleDeleteCategory` 内に残っていた `removeSubCategoryFromGroup`
 * pure logic + `tabGroupRepository.saveAll` 直叩きを use-case 経由へ
 * 移す過程で、 domain `TabGroup` エンティティが表現しない
 * `subCategories` / `urlSubCategories` / `categoryKeywords` の
 * rich 補助フィールド更新を `tabGroupRepository.saveAll` 経由では
 * 書き込めない (mapper が original の rich フィールドを保持してしまう)
 * 既存問題に対応する (issue #519 Codex レビュー P1)。
 *
 * `SetCategoryKeywordsPort` (issue #501) と同じ「 rich 補助フィールド
 * 更新は port に閉じ込める」方針を踏襲し、 port 実装側で
 * `chrome.storage.local` の raw レベル更新を集約する。
 *
 * 戻り値に更新後の `TabGroup` 一覧を返して、 presentation 層が
 * `refreshTabGroupsWithUrls(updatedGroups)` で UI state へ反映できる
 * ようにする。 port 実装は内部で raw レベル更新と同時に domain
 * `TabGroup` への正規化 (subCategory の `urlSubCategories` 引継ぎ等)
 * を行う責務を負う。
 */

/**
 * `RemoveSubCategoryFromTabGroupPort` の関数定義。
 */
import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export type RemoveSubCategoryFromTabGroupPort = {
  /**
   * 指定 `groupId` の `TabGroup` から `categoryName` を 1 件削除し、
   * 永続化する。
   *
   * 戻り値は更新後の `TabGroup` 一覧。 `categoryName` が見つから
   * なかった場合は入力をそのまま返す。
   *
   * 実装は `chrome.storage.local` の raw レベル更新と domain
   * `TabGroup` への正規化を 1 操作で実行し、 presentation 層の
   * state へ反映できる形にする。
   */
  removeSubCategoryFromTabGroup: (
    groupId: string,
    categoryName: string,
  ) => Promise<readonly TabGroup[]>
}

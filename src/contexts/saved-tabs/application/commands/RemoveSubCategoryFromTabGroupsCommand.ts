import type { TabGroup } from '@/types/storage'

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の入力 (issue #519)。
 *
 * 削除対象カテゴリの groupId と削除する子カテゴリ名のみを受け取る。
 * 永続化と更新後 `TabGroup[]` の取得は port 側に委譲し、 port 実装
 * は `chrome.storage.local` の raw レベル更新と domain `TabGroup`
 * への正規化を 1 操作で実行する。
 *
 * port 経由にすることで、 domain `TabGroup` エンティティが表現
 * しない rich 補助フィールド (`subCategories` /
 * `urlSubCategories` / `categoryKeywords`) の更新を
 * `tabGroupRepository.saveAll` 経由では書き込めない (mapper が
 * original の rich フィールドを保持してしまう) 既存問題を回避する
 * (issue #519 Codex レビュー P1)。
 */
export interface RemoveSubCategoryFromTabGroupsCommand {
  readonly groupId: string
  readonly categoryName: string
}

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の戻り値。
 *
 * `tabGroups` を返して、 presentation 層が
 * `refreshTabGroupsWithUrls(updatedGroups)` で UI state へ反映できる
 * ようにする。
 */
export interface RemoveSubCategoryFromTabGroupsResult {
  readonly tabGroups: readonly TabGroup[]
}

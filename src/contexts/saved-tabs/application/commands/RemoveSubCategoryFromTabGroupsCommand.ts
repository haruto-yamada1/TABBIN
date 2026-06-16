import type { TabGroup } from '@/types/storage'

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の入力 (issue #519)。
 *
 * UI 側で削除対象として確定した子カテゴリ名と、それが紐づく
 * `TabGroup` の ID を受け取る。`tabGroups` には presentation 層が
 * 直前に `getSavedTabsPageDataQuery` 等で取得したスナップショットを
 * そのまま渡し、use-case 側で pure に `subCategories` /
 * `urlSubCategories` / `categoryKeywords` を更新した配列を
 * `tabGroupRepository.saveAll` に保存する。
 *
 * presentation 層が扱う `tabGroups` は `getSavedTabsPageDataQuery`
 * 由来 (domain entity 由来) だが、実体は chrome-storage から
 * fetch された storage 層 `TabGroup` と同じ構造を持つ。
 * `removeSubCategoryFromGroup` (domain service) は widening
 * interface 経由でこの構造を受け取り、 rich 補助フィールドを
 * 更新する。use-case 境界で structural な widening キャストを
 * 吸収する設計 (issue #511/#519)。
 */
export interface RemoveSubCategoryFromTabGroupsCommand {
  readonly groupId: string
  readonly categoryName: string
  readonly tabGroups: readonly TabGroup[]
}

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の戻り値。
 *
 * `tabGroups` を返して、presentation 層が state へ反映できるようにする。
 */
export interface RemoveSubCategoryFromTabGroupsResult {
  readonly tabGroups: readonly TabGroup[]
}

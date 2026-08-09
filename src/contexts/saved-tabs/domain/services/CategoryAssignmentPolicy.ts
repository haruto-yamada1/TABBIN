import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import {
  tabGroupCollectionGroupId,
  tabGroupDomainName,
} from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * 親カテゴリの高速検索用マップ。
 *
 * `byId`: `ParentCategoryId` から `ParentCategory` を引く（O(1)）
 * `byTabGroupId`: `TabGroupId` から所属カテゴリを引く（O(1)）
 * `byDomainName`: `DomainName` から所属カテゴリを引く（O(1)）
 *
 * 同じ `TabGroupId` / `DomainName` を複数カテゴリが宣言している場合は
 * 最初に出現したカテゴリを優先する（先勝ち）。
 */
export type CategoryLookup = {
  readonly byId: ReadonlyMap<ParentCategoryId, ParentCategory>
  readonly byTabGroupId: ReadonlyMap<TabGroupId, ParentCategory>
  readonly byDomainName: ReadonlyMap<string, ParentCategory>
}

/**
 * `ParentCategory` の配列から `CategoryLookup` を構築する。
 *
 * `SavedTabsApp.tsx` の `buildCategoryLookup` を domain 等価物に置き換えるための pure 関数。
 *
 * @example
 * ```ts
 * const lookup = buildCategoryLookup([docs, news])
 * lookup.byTabGroupId.get(group.id)
 * ```
 */
export const buildCategoryLookup = (
  categories: readonly ParentCategory[],
): CategoryLookup => {
  const byId = new Map<ParentCategoryId, ParentCategory>()
  const byTabGroupId = new Map<TabGroupId, ParentCategory>()
  const byDomainName = new Map<string, ParentCategory>()
  for (const category of categories) {
    byId.set(category.id, category)
    for (const collection of category.collections) {
      if (!byTabGroupId.has(collection.id)) {
        byTabGroupId.set(collection.id, category)
      }
      if (!byDomainName.has(collection.domain)) {
        byDomainName.set(collection.domain, category)
      }
    }
  }
  return { byId, byTabGroupId, byDomainName }
}

/**
 * `TabGroup` がどの `ParentCategory` に属するかを決定する純粋ポリシー。
 *
 * 優先順位は以下の通り。
 *
 * 1. `group.parentCategoryId` が `lookup.byId` で引ければそのカテゴリ
 * 2. `group.id` が `lookup.byTabGroupId` で引ければそのカテゴリ
 * 3. `group.domain` が `lookup.byDomainName` で引ければそのカテゴリ
 * 4. いずれにも該当しなければ `undefined`（未分類）
 *
 * 既存 `SavedTabsApp.tsx` のカテゴリ判定ルールと一致させる。
 *
 * @example
 * ```ts
 * resolveCategoryForTabGroup(group, buildCategoryLookup([docs])) // docs or undefined
 * ```
 */
export const resolveCategoryForTabGroup = (
  group: TabGroup,
  lookup: CategoryLookup,
): ParentCategory | undefined => {
  const groupId = tabGroupCollectionGroupId(group)
  if (groupId) {
    const direct = lookup.byId.get(createParentCategoryId(groupId))
    if (direct) {
      return direct
    }
  }
  const byTabGroupId = lookup.byTabGroupId.get(group.id)
  if (byTabGroupId) {
    return byTabGroupId
  }
  return lookup.byDomainName.get(tabGroupDomainName(group))
}

/**
 * `TabGroup` が未分類（どのカテゴリにも属さない）かを判定する。
 */
export const isUncategorizedTabGroup = (
  group: TabGroup,
  lookup: CategoryLookup,
): boolean => resolveCategoryForTabGroup(group, lookup) === undefined

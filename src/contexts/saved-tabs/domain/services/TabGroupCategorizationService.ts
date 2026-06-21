import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

import {
  buildCategoryLookup,
  resolveCategoryForTabGroup,
} from './CategoryAssignmentPolicy'
import type { CategoryLookup } from './CategoryAssignmentPolicy'

/**
 * 「未分類」グループを表す sentinel キー。
 *
 * `ParentCategoryId` と衝突しないよう、長く明示的な記号列を使う。
 * 既存ストレージ上の ID には絶対に出現しない前提。
 */
export const UNCATEGORIZED_KEY = '__saved-tabs:uncategorized__' as const

/**
 * `CategoryAssignmentPolicy` のキーまたは `UNCATEGORIZED_KEY`。
 */
export type CategorizedKey = ParentCategoryId | typeof UNCATEGORIZED_KEY

/**
 * カテゴリ別に分類された `TabGroup` のグループ。
 *
 * `key` はカテゴリ ID または `UNCATEGORIZED_KEY`、`category` は
 * カテゴリ ID の場合のみ参照可能（未分類では undefined）。
 */
export interface CategorizedTabGroups {
  readonly key: CategorizedKey
  readonly category?: ParentCategory
  readonly groups: readonly TabGroup[]
}

/**
 * `TabGroup` 配列を `ParentCategory` 配列に基づいて分類する pure 関数。
 *
 * `SavedTabsApp.tsx` の `buildCategoryLookup` + `sortCategorizedGroups` 相当の
 * domain 側エントリポイント。返り値の順序はカテゴリ配列の順序に従い、
 * 未分類は末尾の 1 グループにまとめる。
 *
 * @example
 * ```ts
 * const result = categorizeTabGroups({ groups, categories })
 * for (const bucket of result) {
 *   console.log(bucket.key, bucket.groups.length)
 * }
 * ```
 */
export const categorizeTabGroups = ({
  groups,
  categories,
}: {
  groups: readonly TabGroup[]
  categories: readonly ParentCategory[]
}): CategorizedTabGroups[] => {
  const lookup = buildCategoryLookup(categories)
  const bucketsById = new Map<ParentCategoryId, TabGroup[]>()
  const uncategorized: TabGroup[] = []
  for (const group of groups) {
    const category = resolveCategoryForTabGroup(group, lookup)
    if (!category) {
      uncategorized.push(group)
      continue
    }
    const existing = bucketsById.get(category.id)
    if (existing) {
      existing.push(group)
    } else {
      bucketsById.set(category.id, [group])
    }
  }
  const result: CategorizedTabGroups[] = categories
    .filter((category) => bucketsById.has(category.id))
    .map<CategorizedTabGroups>((category) => ({
      key: category.id,
      category,
      groups: sortGroupsByCategoryDomainOrder(
        bucketsById.get(category.id) ?? [],
        category,
      ),
    }))
  if (uncategorized.length > 0) {
    result.push({ key: UNCATEGORIZED_KEY, groups: uncategorized })
  }
  return result
}

/**
 * `ParentCategory.domains` の順序に従って `TabGroup` をソートする。
 *
 * 既存 `sortCategorizedGroups` の domain 等価物。`domains` に出現しないグループは
 * 末尾へ移動し、相対順序は維持する（安定ソート）。
 */
export const sortGroupsByCategoryDomainOrder = (
  groups: readonly TabGroup[],
  category: ParentCategory,
): TabGroup[] => {
  if (category.domains.length === 0) {
    return [...groups]
  }
  const order = new Map(
    category.domains.map((tabGroupId, index) => [tabGroupId, index]),
  )
  const indexed = groups.map((group, originalIndex) => ({
    group,
    originalIndex,
    sortIndex: order.get(group.id) ?? Number.POSITIVE_INFINITY,
  }))
  indexed.sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex
    }
    return a.originalIndex - b.originalIndex
  })
  return indexed.map((entry) => entry.group)
}

export type { CategoryLookup }

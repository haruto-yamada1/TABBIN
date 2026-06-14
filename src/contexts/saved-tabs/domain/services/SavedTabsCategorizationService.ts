import type { ParentCategory, TabGroup } from '@/types/storage'

/**
 * 親カテゴリの高速検索用マップ (presentation 形 / unbranded ID ベース)。
 *
 * `CategoryAssignmentPolicy.CategoryLookup` (branded types ベース) とは
 * キー型が branded か `string` かのみが異なる。`SavedTabsApp` 既存挙動
 * (string ID ベース) と完全互換の lookup を domain 側でも提供するための型
 * (issue #496)。
 *
 * - `byId`: `ParentCategory.id` から `ParentCategory` を引く (O(1))
 * - `byGroupId`: `TabGroup.id` から所属カテゴリを引く (O(1))
 * - `byDomainName`: `TabGroup.domain` から所属カテゴリを引く (O(1))
 *
 * 同じ `TabGroupId` / `DomainName` を複数カテゴリが宣言している場合は
 * 最初に出現したカテゴリを優先する（先勝ち）。
 */
export interface PresentationCategoryLookup {
  readonly byId: ReadonlyMap<string, ParentCategory>
  readonly byGroupId: ReadonlyMap<string, ParentCategory>
  readonly byDomainName: ReadonlyMap<string, ParentCategory>
}

/**
 * `ParentCategory[]` から `PresentationCategoryLookup` を構築する。
 *
 * `SavedTabsApp.tsx` の `buildCategoryLookup` (presentation 形) を
 * domain 等価物に置き換えるための pure 関数 (issue #496)。
 *
 * @example
 * ```ts
 * const lookup = buildPresentationCategoryLookup([docs, news])
 * lookup.byGroupId.get(group.id)
 * ```
 */
export const buildPresentationCategoryLookup = (
  categories: readonly ParentCategory[],
): PresentationCategoryLookup => {
  const byId = new Map<string, ParentCategory>()
  const byGroupId = new Map<string, ParentCategory>()
  const byDomainName = new Map<string, ParentCategory>()
  for (const category of categories) {
    byId.set(category.id, category)
    for (const tabGroupId of category.domains) {
      if (!byGroupId.has(tabGroupId)) {
        byGroupId.set(tabGroupId, category)
      }
    }
    for (const domainName of category.domainNames) {
      if (!byDomainName.has(domainName)) {
        byDomainName.set(domainName, category)
      }
    }
  }
  return { byId, byGroupId, byDomainName }
}

const hasDisplayableUrls = (group: TabGroup): boolean => {
  const hasNewUrls = Boolean(group.urlIds && group.urlIds.length > 0)
  const hasOldUrls = Boolean(group.urls && group.urls.length > 0)
  return hasNewUrls || hasOldUrls
}

const pushGroupToCategory = (
  categorizedGroups: Record<string, TabGroup[]>,
  categoryId: string,
  group: TabGroup,
): void => {
  if (!categorizedGroups[categoryId]) {
    categorizedGroups[categoryId] = []
  }
  const categorizedGroup =
    group.parentCategoryId === categoryId
      ? group
      : {
          ...group,
          parentCategoryId: categoryId,
        }
  categorizedGroups[categoryId].push(categorizedGroup)
}

const tryCategorizeById = (
  group: TabGroup,
  categoryLookup: PresentationCategoryLookup,
  categorizedGroups: Record<string, TabGroup[]>,
): boolean => {
  const category = categoryLookup.byGroupId.get(group.id)
  if (!category) {
    return false
  }
  pushGroupToCategory(categorizedGroups, category.id, group)
  return true
}

const tryCategorizeByDomainName = (
  group: TabGroup,
  categoryLookup: PresentationCategoryLookup,
  categorizedGroups: Record<string, TabGroup[]>,
): boolean => {
  const category = categoryLookup.byDomainName.get(group.domain)
  if (!category) {
    return false
  }
  pushGroupToCategory(categorizedGroups, category.id, group)
  return true
}

const matchesParentCategoryQuery = (
  group: TabGroup,
  categoryLookup: PresentationCategoryLookup,
  normalizedQuery: string,
): boolean => {
  if (group.parentCategoryId) {
    const parentCategory = categoryLookup.byId.get(group.parentCategoryId)
    if (parentCategory) {
      return parentCategory.name.toLowerCase().includes(normalizedQuery)
    }
  }
  const fallbackCategory =
    // `||` needed: Map.get() could return empty string
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    categoryLookup.byGroupId.get(group.id) ||
    categoryLookup.byDomainName.get(group.domain)
  if (fallbackCategory) {
    return fallbackCategory.name.toLowerCase().includes(normalizedQuery)
  }
  return false
}

const filterGroupByQuery = (
  group: TabGroup,
  normalizedQuery: string,
  categoryLookup: PresentationCategoryLookup,
): TabGroup => {
  const currentUrls = group.urls ?? []
  if (currentUrls.length === 0) {
    return group
  }
  const parentCategoryMatched = matchesParentCategoryQuery(
    group,
    categoryLookup,
    normalizedQuery,
  )
  const filteredUrls = currentUrls.filter((item) => {
    const matchesBasicFields =
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.url.toLowerCase().includes(normalizedQuery) ||
      group.domain.toLowerCase().includes(normalizedQuery)
    const matchesSubCategory = item.subCategory
      ?.toLowerCase()
      .includes(normalizedQuery)
    // eslint-disable-next-line typescript/prefer-nullish-coalescing -- boolean values; false should not fall through
    return matchesBasicFields || matchesSubCategory || parentCategoryMatched
  })
  if (filteredUrls.length === currentUrls.length) {
    return group
  }
  return {
    ...group,
    urls: filteredUrls,
  }
}

const sortCategorizedGroups = (
  categorizedGroups: Record<string, TabGroup[]>,
  categoryLookup: PresentationCategoryLookup,
): void => {
  for (const categoryId of Object.keys(categorizedGroups)) {
    const category = categoryLookup.byId.get(categoryId)
    const domains = category?.domains
    if (!(domains && domains.length > 0)) {
      continue
    }
    const domainOrder = new Map(domains.map((domain, index) => [domain, index]))
    categorizedGroups[categoryId].sort((a, b) => {
      const indexA = domainOrder.get(a.id) ?? -1
      const indexB = domainOrder.get(b.id) ?? -1
      if (indexA === -1) {
        return 1
      }
      if (indexB === -1) {
        return -1
      }
      return indexA - indexB
    })
  }
}

/**
 * `TabGroup` 配列を `ParentCategory` 配列と `PresentationCategoryLookup` を
 * 使ってカテゴリ別に振り分ける pure 関数。
 *
 * `SavedTabsApp.tsx` の `organizeTabGroupsWithCategories` を domain 側へ
 * 純粋関数として移設したもの (issue #496)。React / chrome API / toast /
 * router / console には依存しない。
 *
 * - `enableCategories=false` のときは全グループを `uncategorized` に置く
 * - `searchQuery` が指定された場合は URL / title / subCategory / カテゴリ名で
 *   フィルタしたうえで分類する
 * - 戻り値の `categorized` は `Record<categoryId, TabGroup[]>` で、
 *   各カテゴリ配列は `ParentCategory.domains` 順でソートされる
 *   (順序に存在しない TabGroup は末尾、相対順序維持)
 * - `uncategorized` はどのカテゴリにも該当しなかったグループ
 *
 * 旧 `SavedTabsApp.tsx` の `organizeTabGroupsWithCategories` と挙動互換。
 * `console.log` デバッグ出力は省略している。
 *
 * @example
 * ```ts
 * const result = organizeTabGroupsWithCategories({
 *   enableCategories: true,
 *   categoryLookup,
 *   tabGroupsWithUrls,
 * })
 * // result.categorized: { 'cat-1': [group1, group2], 'cat-2': [group3] }
 * // result.uncategorized: [group4]
 * ```
 */
export const organizeTabGroupsWithCategories = ({
  enableCategories,
  tabGroupsWithUrls,
  categoryLookup,
  searchQuery,
}: {
  readonly enableCategories: boolean
  readonly tabGroupsWithUrls: readonly TabGroup[]
  readonly categoryLookup: PresentationCategoryLookup
  readonly searchQuery?: string
}): {
  readonly categorized: Record<string, TabGroup[]>
  readonly uncategorized: TabGroup[]
} => {
  if (!enableCategories) {
    return {
      categorized: {},
      uncategorized: [...tabGroupsWithUrls],
    }
  }
  const categorizedGroups: Record<string, TabGroup[]> = {}
  const uncategorizedGroups: TabGroup[] = []
  const normalizedQuery = searchQuery?.trim().toLowerCase() ?? ''
  const hasSearchQuery = normalizedQuery.length > 0
  const groupsToOrganize = tabGroupsWithUrls.reduce<TabGroup[]>(
    (groups, group) => {
      const nextGroup = hasSearchQuery
        ? filterGroupByQuery(group, normalizedQuery, categoryLookup)
        : group
      if (hasDisplayableUrls(nextGroup)) {
        groups.push(nextGroup)
      }
      return groups
    },
    [],
  )
  for (const group of groupsToOrganize) {
    const categorizedById = tryCategorizeById(
      group,
      categoryLookup,
      categorizedGroups,
    )
    if (categorizedById) {
      continue
    }
    const categorizedByDomainName = tryCategorizeByDomainName(
      group,
      categoryLookup,
      categorizedGroups,
    )
    if (!categorizedByDomainName) {
      uncategorizedGroups.push(group)
    }
  }
  sortCategorizedGroups(categorizedGroups, categoryLookup)
  return {
    categorized: categorizedGroups,
    uncategorized: uncategorizedGroups,
  }
}

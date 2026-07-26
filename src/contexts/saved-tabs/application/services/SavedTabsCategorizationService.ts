import type {
  SavedTabsParentCategoryDto as ParentCategoryDto,
  SavedTabsDisplayTabGroupDto as TabGroupDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/**
 * 親カテゴリの高速検索用マップ (domain DTO ベース)。
 *
 * `CategoryAssignmentPolicy.CategoryLookup` (branded types ベース) とは
 * キー型が branded か `string` かのみが異なる。`SavedTabsApp` 既存挙動
 * (string ID ベース) と完全互換の lookup を domain 側でも提供するための型
 * (issue #496)。
 *
 * - `byId`: `ParentCategoryDto.id` から `ParentCategoryDto` を引く (O(1))
 * - `byGroupId`: `TabGroupDto.id` から所属カテゴリを引く (O(1))
 * - `byDomainName`: `TabGroupDto.domain` から所属カテゴリを引く (O(1))
 *
 * 同じ `TabGroupDto.id` / domain name を複数カテゴリが宣言している場合は
 * 最初に出現したカテゴリを優先する（先勝ち）。
 *
 * `@/types/storage` への依存を避け、domain DTO のみで lookup を構築
 * する (issue #511)。
 */
export type PresentationCategoryLookup = {
  readonly byId: ReadonlyMap<string, ParentCategoryDto>
  readonly byGroupId: ReadonlyMap<string, ParentCategoryDto>
  readonly byDomainName: ReadonlyMap<string, ParentCategoryDto>
}

/**
 * `ParentCategoryDto[]` から `PresentationCategoryLookup` を構築する。
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
  categories: readonly ParentCategoryDto[],
): PresentationCategoryLookup => {
  const byId = new Map<string, ParentCategoryDto>()
  const byGroupId = new Map<string, ParentCategoryDto>()
  const byDomainName = new Map<string, ParentCategoryDto>()
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

const hasDisplayableUrls = (group: TabGroupDto): boolean => {
  const hasNewUrls = Boolean(group.urlIds && group.urlIds.length > 0)
  const hasOldUrls = Boolean(group.urls && group.urls.length > 0)
  return hasNewUrls || hasOldUrls
}

const assignParentCategory = (
  group: TabGroupDto,
  categoryId: string,
): TabGroupDto =>
  group.parentCategoryId === categoryId
    ? group
    : {
        ...group,
        parentCategoryId: categoryId,
      }

const resolveCategoryIdByGroupId = (
  group: TabGroupDto,
  categoryLookup: PresentationCategoryLookup,
): string | undefined => {
  const category = categoryLookup.byGroupId.get(group.id)
  return category?.id
}

const resolveCategoryIdByDomainName = (
  group: TabGroupDto,
  categoryLookup: PresentationCategoryLookup,
): string | undefined => {
  const category = categoryLookup.byDomainName.get(group.domain)
  return category?.id
}

const matchesParentCategoryQuery = (
  group: TabGroupDto,
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
  group: TabGroupDto,
  normalizedQuery: string,
  categoryLookup: PresentationCategoryLookup,
): TabGroupDto => {
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

const sortGroupsByDomainOrder = (
  groups: readonly TabGroupDto[],
  domains: readonly string[],
): TabGroupDto[] => {
  const domainOrder = new Map(domains.map((domain, index) => [domain, index]))
  return groups.toSorted((a, b) => {
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

const sortCategorizedGroups = (
  categorizedGroups: Record<string, TabGroupDto[]>,
  categoryLookup: PresentationCategoryLookup,
): Record<string, TabGroupDto[]> =>
  Object.fromEntries(
    Object.entries(categorizedGroups).map(([categoryId, groups]) => {
      const category = categoryLookup.byId.get(categoryId)
      const domains = category?.domains
      if (!(domains && domains.length > 0)) {
        return [categoryId, [...groups]]
      }
      return [categoryId, sortGroupsByDomainOrder(groups, domains)]
    }),
  )

const resolveCategoryId = (
  group: TabGroupDto,
  categoryLookup: PresentationCategoryLookup,
): string | undefined =>
  resolveCategoryIdByGroupId(group, categoryLookup) ??
  resolveCategoryIdByDomainName(group, categoryLookup)

const addGroupToCategory = (
  categorizedGroups: Record<string, TabGroupDto[]>,
  categoryId: string,
  group: TabGroupDto,
): Record<string, TabGroupDto[]> => ({
  ...categorizedGroups,
  [categoryId]: [
    ...(categorizedGroups[categoryId] ?? []),
    assignParentCategory(group, categoryId),
  ],
})

/**
 * `TabGroupDto[]` 配列を `ParentCategoryDto[]` 配列と
 * `PresentationCategoryLookup` を使ってカテゴリ別に振り分ける pure 関数。
 *
 * `SavedTabsApp.tsx` の `organizeTabGroupsWithCategories` を domain 側へ
 * 純粋関数として移設したもの (issue #496)。React / chrome API / toast /
 * router / console には依存しない。
 *
 * - `enableCategories=false` のときは全グループを `uncategorized` に置く
 * - `searchQuery` が指定された場合は URL / title / subCategory / カテゴリ名で
 *   フィルタしたうえで分類する
 * - 戻り値の `categorized` は `Record<categoryId, TabGroupDto[]>` で、
 *   各カテゴリ配列は `ParentCategoryDto.domains` 順でソートされる
 *   (順序に存在しない TabGroup は末尾、相対順序維持)
 * - `uncategorized` はどのカテゴリにも該当しなかったグループ
 *
 * 旧 `SavedTabsApp.tsx` の `organizeTabGroupsWithCategories` と挙動互換。
 * `console.log` デバッグ出力は省略している。
 *
 * `@/types/storage` には依存せず、domain DTO (`TabGroupDto` /
 * `ParentCategoryDto`) だけで動く (issue #511)。
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
  readonly tabGroupsWithUrls: readonly TabGroupDto[]
  readonly categoryLookup: PresentationCategoryLookup
  readonly searchQuery?: string
}): {
  readonly categorized: Record<string, TabGroupDto[]>
  readonly uncategorized: TabGroupDto[]
} => {
  if (!enableCategories) {
    return {
      categorized: {},
      uncategorized: [...tabGroupsWithUrls],
    }
  }
  let categorizedGroups: Record<string, TabGroupDto[]> = {}
  const uncategorizedGroups: TabGroupDto[] = []
  const normalizedQuery = searchQuery?.trim().toLowerCase() ?? ''
  const hasSearchQuery = normalizedQuery.length > 0
  const groupsToOrganize = tabGroupsWithUrls
    .map((group) =>
      hasSearchQuery
        ? filterGroupByQuery(group, normalizedQuery, categoryLookup)
        : group,
    )
    .filter(hasDisplayableUrls)
  for (const group of groupsToOrganize) {
    const categoryId = resolveCategoryId(group, categoryLookup)
    if (!categoryId) {
      uncategorizedGroups.push(group)
      continue
    }
    categorizedGroups = addGroupToCategory(categorizedGroups, categoryId, group)
  }
  return {
    categorized: sortCategorizedGroups(categorizedGroups, categoryLookup),
    uncategorized: uncategorizedGroups,
  }
}

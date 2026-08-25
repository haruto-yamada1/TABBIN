import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * カテゴリ間ドメイン移動の pure domain service (issue #525)。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleMoveDomainToCategory` 内の
 * - 移動元カテゴリから `domainId` / `domainName` を取り除く
 * - 移動先カテゴリに `domainId` / `domainName` を追加する
 *
 * ロジックを domain 等価物として抽出したもの。
 *
 * UI 側で受け取った `tabGroups`（`TabGroup` 配列）から対象 domain
 * (`TabGroupId` 一致) を引き、`domainName` を `DomainName` 化するのは
 * use-case 側の責務。本 service は `domainId` / `domainName` が確定した
 * 後の純粋な配列変換のみを担う。
 *
 * domain 層ガード (React 依存禁止、`chrome.*` 依存禁止、`toast` 依存
 * 禁止、`@dnd-kit/sortable` 依存禁止) を満たすため、副作用・永続化・
 * ロギングは含めない。
 */
export type MoveDomainBetweenCategoriesParams = {
  readonly categories: readonly ParentCategory[]
  readonly domainId: TabGroupId
  readonly domainName: DomainName
  /**
   * 移動元カテゴリの `ParentCategoryId`。
   * 未分類（どのカテゴリにも属さない）からの移動は `null`。
   */
  readonly fromCategoryId: string | null
  /** 移動先カテゴリの `ParentCategoryId`。 */
  readonly toCategoryId: string
}

export type MoveDomainBetweenCategoriesResult = {
  readonly moved: boolean
  readonly updatedCategories: readonly ParentCategory[]
}

const removeDomainFromCategory = (
  category: ParentCategory,
  domainId: TabGroupId,
  domainName: DomainName,
): ParentCategory => {
  return {
    ...category,
    collections: category.collections.filter(
      ({ domain, id }) => id !== domainId && domain !== domainName,
    ),
  }
}

const addDomainToCategory = (
  category: ParentCategory,
  domainId: TabGroupId,
  domainName: DomainName,
): ParentCategory => {
  const alreadyAssigned = category.collections.some(
    ({ domain, id }) => id === domainId || domain === domainName,
  )
  return {
    ...category,
    collections: alreadyAssigned
      ? [...category.collections]
      : [...category.collections, { domain: domainName, id: domainId }],
  }
}

export const moveDomainBetweenCategories = (
  params: MoveDomainBetweenCategoriesParams,
): MoveDomainBetweenCategoriesResult => {
  const { categories, domainId, domainName, fromCategoryId, toCategoryId } =
    params
  let moved = false
  const updatedCategories = categories.map((category) => {
    // 移動元と移動先が同一カテゴリの場合は remove -> add を順に適用。
    if (
      fromCategoryId !== null &&
      category.id === fromCategoryId &&
      category.id === toCategoryId
    ) {
      const before = category
      const afterRemove = removeDomainFromCategory(
        category,
        domainId,
        domainName,
      )
      const afterAdd = addDomainToCategory(afterRemove, domainId, domainName)
      if (afterRemove.collections.length !== before.collections.length) {
        moved = true
      }
      return afterAdd
    }
    if (fromCategoryId !== null && category.id === fromCategoryId) {
      const before = category
      const next = removeDomainFromCategory(category, domainId, domainName)
      if (next.collections.length !== before.collections.length) {
        moved = true
      }
      return next
    }
    if (category.id === toCategoryId) {
      const before = category
      const next = addDomainToCategory(category, domainId, domainName)
      if (next.collections.length !== before.collections.length) {
        moved = true
      }
      return next
    }
    return { ...category }
  })
  return { moved, updatedCategories }
}

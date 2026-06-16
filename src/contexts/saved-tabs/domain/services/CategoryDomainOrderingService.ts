import type { ParentCategory } from '../entities/ParentCategory'
import type { TabGroupId } from '../value-objects/TabGroupId'

/**
 * カテゴリ内ドメイン順序更新の pure domain service (issue #525)。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleUpdateDomainsOrder` 内の
 * - 対象カテゴリの `domains` を新しい順序へ組み替える
 *
 * ロジックを domain 等価物として抽出したもの。
 *
 * UI 側は `TabGroup` 配列を受け取るが、domain 層は永続化対象である
 * `TabGroupId[]` のみを扱う。`TabGroup` -> `TabGroupId` 変換は
 * use-case 側に閉じる。
 *
 * domain 層ガード (React 依存禁止、`chrome.*` 依存禁止、`toast` 依存
 * 禁止、`@dnd-kit/sortable` 依存禁止) を満たすため、副作用・永続化・
 * ロギングは含めず、純粋な配列変換のみを公開する。
 */
export interface ReorderDomainsInCategoryParams {
  readonly categories: readonly ParentCategory[]
  /** 並び替え対象カテゴリの `ParentCategoryId`。 */
  readonly categoryId: string
  /**
   * 新しいドメイン順序（`TabGroupId` の配列）。
   * UI 側で並び替えたあとの順序をそのまま渡す。既存 `domains` に
   * 存在しない ID（新規追加されたものなど）は末尾へ保持される。
   */
  readonly domainIds: readonly TabGroupId[]
}

export interface ReorderDomainsInCategoryResult {
  readonly targetFound: boolean
  readonly updatedCategories: readonly ParentCategory[]
  readonly domainIdOrder: readonly TabGroupId[]
}

export const reorderDomainsInCategory = (
  params: ReorderDomainsInCategoryParams,
): ReorderDomainsInCategoryResult => {
  const { categories, categoryId, domainIds } = params
  const targetCategory = categories.find(
    (category) => category.id === categoryId,
  )
  if (!targetCategory) {
    return {
      domainIdOrder: [],
      targetFound: false,
      updatedCategories: categories.map((category) => ({ ...category })),
    }
  }
  const existingDomainIds = new Set<TabGroupId>(targetCategory.domains)
  const orderedExisting = domainIds.filter((id) => existingDomainIds.has(id))
  const inputIdSet = new Set<TabGroupId>(domainIds)
  const trailingIds = targetCategory.domains.filter((id) => !inputIdSet.has(id))
  const nextDomainIds: readonly TabGroupId[] = [
    ...orderedExisting,
    ...trailingIds,
  ]
  const updatedCategories = categories.map((category) =>
    category.id === categoryId
      ? { ...category, domains: nextDomainIds }
      : { ...category },
  )
  return {
    domainIdOrder: nextDomainIds,
    targetFound: true,
    updatedCategories,
  }
}

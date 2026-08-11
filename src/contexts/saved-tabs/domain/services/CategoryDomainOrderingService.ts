import type {
  ParentCategory,
  ParentCategoryCollection,
} from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * カテゴリ内ドメイン順序更新の pure domain service (issue #525)。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleUpdateDomainsOrder` 内の
 * - 対象カテゴリの `domains` を UI から渡された順序へ組み替える
 *
 * ロジックを domain 等価物として抽出したもの。
 *
 * UI 側は `TabGroup` 配列を受け取るが、domain 層は ID と domain を
 * 一体化した collection projection のみを扱う。変換は use-case 側に閉じる。
 *
 * domain 層ガード (React 依存禁止、`chrome.*` 依存禁止、`toast` 依存
 * 禁止、`@dnd-kit/sortable` 依存禁止) を満たすため、副作用・永続化・
 * ロギングは含めず、純粋な配列変換のみを公開する。
 *
 * 旧実装との互換性:
 * - `updatedDomains` から作った collection の順序をそのまま保存する。
 * - 現在の category にないエントリも ID と domain の組を保ったまま追加する。
 * - 対象カテゴリが見つからない場合は no-op として現在値を返す。
 */
export type ReorderDomainsInCategoryParams = {
  readonly categories: readonly ParentCategory[]
  readonly categoryId: string
  readonly collections: readonly ParentCategoryCollection[]
}

export type ReorderDomainsInCategoryResult = {
  readonly targetFound: boolean
  readonly updatedCategories: readonly ParentCategory[]
  readonly domainIdOrder: readonly TabGroupId[]
}

export const reorderDomainsInCategory = (
  params: ReorderDomainsInCategoryParams,
): ReorderDomainsInCategoryResult => {
  const { categories, categoryId, collections } = params
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
  const updatedCategories = categories.map((category) =>
    category.id === categoryId
      ? {
          ...category,
          collections: collections.map((collection) => ({ ...collection })),
        }
      : { ...category },
  )
  return {
    domainIdOrder: collections.map(({ id }) => id),
    targetFound: true,
    updatedCategories,
  }
}

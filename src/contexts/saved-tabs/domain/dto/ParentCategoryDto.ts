import type { CollectionReferenceDto } from './CollectionProjectionDto'

/**
 * `SavedTabsCategorizationService` が受け取る `ParentCategory` の
 * domain 入力 DTO (issue #511)。
 *
 * `@/types/storage.ParentCategory` と構造互換。
 * branded な `ParentCategory` entity (値オブジェクト) ではなく
 * plain string ベースとしている理由:
 * - `SavedTabsCategorizationService` の `PresentationCategoryLookup` は
 *   `byId: ReadonlyMap<string, ParentCategoryDto>` /
 *   `byGroupId: ReadonlyMap<string, ParentCategoryDto>` /
 *   `byDomainName: ReadonlyMap<string, ParentCategoryDto>` の
 *   string キーで lookup を組む
 * - `syncGroupCategoryAssignment` 等で `category.domains.includes(group.id)`
 *   のように plain string 比較するため、branded 配列だと lookup と
 *   キー型が揃わない
 *
 * 配列フィールドは `@/types/storage.ParentCategory` との structural
 * 互換のため readonly 修飾を敢えて付けず、mutable として公開する。
 */
export type ParentCategoryDto = {
  collections: CollectionReferenceDto[]
  id: string
  name: string
}

/**
 * `DomainCategoryMappingRepository` の DTO (issue #511)。
 *
 * `@/types/storage.DomainParentCategoryMapping` と構造互換の
 * plain object。`domain` を主キー、`categoryId` を値とする
 * 1:N 風マッピングを domain 側で扱うために使う。
 */
export interface DomainCategoryMappingDto {
  domain: string
  categoryId: string
}

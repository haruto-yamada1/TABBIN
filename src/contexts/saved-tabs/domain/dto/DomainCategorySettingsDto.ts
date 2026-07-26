/**
 * `DomainCategorySettingsRepository` の DTO (issue #511)。
 *
 * `@/types/storage.DomainCategorySettings` と構造互換の
 * plain object。`SubCategoryKeyword` 相当は同ファイル内の
 * `SubCategoryKeywordDto` として再定義し、`@/types/storage` への
 * 依存を断つ。
 */
export type SubCategoryKeywordDto = {
  categoryName: string
  keywords: string[]
}

export type DomainCategorySettingsDto = {
  domain: string
  subCategories: string[]
  categoryKeywords: SubCategoryKeywordDto[]
}

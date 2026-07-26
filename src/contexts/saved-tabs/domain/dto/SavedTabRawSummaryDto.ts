export type SavedTabRawSubCategoryKeywordDto = {
  readonly categoryName: string
  readonly keywords: readonly string[]
}

/**
 * storage 上の `savedTabs[]` のうち、domain entity `TabGroup` には
 * 載らない rich 補助フィールドを DTO 化したもの。
 *
 * `TabGroup` entity は `id` / `domain` / `urlIds` / `parentCategoryId`
 * / `savedAt` だけを表現する (issue #454)。一方 storage には
 * `subCategories` / `categoryKeywords` / `urls` /
 * `urlSubCategories` / `subCategoryOrder` /
 * `subCategoryOrderWithUncategorized` といった presentation 用の
 * rich フィールドが並んでおり、削除前処理の use-case
 * (issue #524 の `PrepareTabGroupDeletionUseCase`) では
 * `subCategories` / `categoryKeywords` を
 * `CategoriesCommandService.updateDomainCategorySettings` に
 * 渡す必要がある。
 *
 * この DTO は domain 層から chrome-storage 実装へ依存を漏らさない
 * ための中間表現で、`ChromeTabGroupRepository` 側の `SavedTabRaw`
 * から `findRawTabGroupById` で 4 フィールドだけを抜き出して
 * 投影する。
 */
export type SavedTabRawSummaryDto = {
  readonly id: string
  readonly domain: string
  readonly parentCategoryId: string | undefined
  readonly subCategories: readonly string[]
  readonly categoryKeywords: readonly SavedTabRawSubCategoryKeywordDto[]
}

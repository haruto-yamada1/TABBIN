import type { SubCategoryKeywordDto } from '../../domain/dto/DomainCategorySettingsDto'

/**
 * 旧 `src/lib/storage/categories` の高レベル操作のうち entity 化
 * されないフィールド (`domainCategorySettings`) を mutate する
 * 操作だけを port として再公開する DDD 境界 interface。
 *
 * 背景:
 * - `domainCategoryMappings` / `domainCategorySettings` は
 *   chrome-storage repository 経由 (`DomainCategoryMappingRepository` /
 *   `DomainCategorySettingsRepository`) で CRUD できる。
 * - `updateDomainCategoryMapping` /
 *   `updateDomainCategorySettings` は entity 化されない単純な
 *   upsert なので、presentation から repository.saveAll を直接呼べば
 *   十分（本 port には含めない）。
 *
 * したがって本 port は 旧 `lib/storage/categories` に対する薄い
 * facade ではなく、`PrepareTabGroupDeletionUseCase` (issue #524) が
 * 「ドメイン削除時に子カテゴリ設定を永続化する」用途に限定して
 * 呼び出す操作だけを公開する。`lib/storage/categories` の他の関数
 * (`getParentCategories` / `saveParentCategories` /
 * `createParentCategory` / `deleteParentCategory` /
 * `getDomainCategoryMappings` / `getDomainCategorySettings`) は
 * repository / use-case 経由で扱う方針 (issue #509)。
 *
 * `@/types/storage.SubCategoryKeyword` ではなく domain DTO
 * `SubCategoryKeywordDto` を使う (issue #511)。
 */
export interface CategoriesCommandService {
  /**
   * 旧 `lib/storage/categories.updateDomainCategorySettings` の port 版。
   * 単一ドメインの `DomainCategorySettings` を upsert する。
   */
  updateDomainCategorySettings: (
    domain: string,
    subCategories: string[],
    categoryKeywords: SubCategoryKeywordDto[],
  ) => Promise<void>
}

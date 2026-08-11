import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import { updateDomainCategorySettings } from '@/lib/storage/categories'

/**
 * `CategoriesCommandService` の `lib/storage` delegate 実装。
 *
 * 旧 `src/lib/storage/categories.updateDomainCategorySettings` 互換の
 * port 実装。`PrepareTabGroupDeletionUseCase` (issue #524) が
 * この port を呼ぶことで、`@/lib/storage/categories` の
 * 直接 import を application 層から避ける (issue #509)。
 *
 * domain DTO `SubCategoryKeywordDto` を受け取り、mapper 経由で
 * storage 形 `SubCategoryKeyword[]` へ逆変換して lib/storage 関数
 * へ渡す (issue #511)。
 *
 * `getParentCategories` / `saveParentCategories` /
 * `createParentCategory` / `deleteParentCategory` /
 * `getDomainCategoryMappings` / `getDomainCategorySettings` /
 * `updateDomainCategoryMapping` は本 port には含めず、repository /
 * use-case 経由 (`parentCategoryRepository` /
 * `DomainCategoryMappingRepository` /
 * `DomainCategorySettingsRepository` /
 * `CreateParentCategoryUseCase` / `DeleteParentCategoryUseCase` /
 * `AssignDomainToCategoryUseCase`) で扱う。
 */
export const createLibCategoriesCommandService =
  (): CategoriesCommandService => ({
    updateCollectionCategories: async (collection, categories) => {
      if (collection.definition.type !== 'domain') {
        throw new Error(
          `Domain category settings require a domain collection: ${collection.id}`,
        )
      }
      const orderedCategories = categories.toSorted(
        (left, right) => left.sortOrder - right.sortOrder,
      )
      await updateDomainCategorySettings(
        collection.definition.domain,
        orderedCategories.map(({ name }) => name),
        orderedCategories.map(({ keywords, name }) => ({
          categoryName: name,
          keywords: [...keywords],
        })),
      )
    },
  })

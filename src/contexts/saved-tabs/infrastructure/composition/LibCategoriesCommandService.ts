import { updateDomainCategorySettings } from '@/lib/storage/categories'

import { toStorageDomainCategorySettings } from '../../application/mappers/SavedTabsDtosMapper'
import type { CategoriesCommandService } from '../../application/ports/CategoriesCommandService'
import type { SubCategoryKeywordDto } from '../../domain/dto/DomainCategorySettingsDto'

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
    updateDomainCategorySettings: async (
      domain: string,
      subCategories: string[],
      categoryKeywords: SubCategoryKeywordDto[],
    ) => {
      const storage = toStorageDomainCategorySettings([
        {
          categoryKeywords,
          domain,
          subCategories,
        },
      ])
      const first = storage[0]
      if (!first) {
        return
      }
      await updateDomainCategorySettings(
        first.domain,
        [...first.subCategories],
        [...first.categoryKeywords],
      )
    },
  })

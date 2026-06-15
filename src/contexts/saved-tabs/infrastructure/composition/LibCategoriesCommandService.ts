import { updateDomainCategorySettings } from '@/lib/storage/categories'
import type { SubCategoryKeyword } from '@/types/storage'

import type { CategoriesCommandService } from '../../application/ports/CategoriesCommandService'

/**
 * `CategoriesCommandService` の `lib/storage` delegate 実装。
 *
 * 旧 `src/lib/storage/categories.updateDomainCategorySettings` 互換の
 * port 実装。presentation 層 (`tab-operations.ts` の
 * `handleTabGroupRemoval`) がこの port を呼ぶことで、
 * `@/lib/storage/categories` の直接 import を避ける
 * (issue #509)。
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
      categoryKeywords: SubCategoryKeyword[],
    ) => {
      await updateDomainCategorySettings(
        domain,
        subCategories,
        categoryKeywords,
      )
    },
  })

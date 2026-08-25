import type { ReorderDomainsInCategoryCommand } from '@/contexts/saved-tabs/application/commands/ReorderDomainsInCategoryCommand'
import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { tabGroupDomainName } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { reorderDomainsInCategory } from '@/contexts/saved-tabs/domain/services/CategoryDomainOrderingService'
import {
  createDomainName,
  normalizeDomainString,
} from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * `ReorderDomainsInCategoryUseCase` が依存する repository 群。
 */
export type ReorderDomainsInCategoryUseCaseDeps = {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `ReorderDomainsInCategoryUseCase` の関数型。
 *
 * 成功時は更新後の application DTO を返す。`categoryId` が
 * `categories` 中に存在しない場合は no-op として現在値を返す（旧
 * `useCategoryManagement.handleUpdateDomainsOrder` の挙動と一致）。
 */
export type ReorderDomainsInCategoryUseCase = (
  command: ReorderDomainsInCategoryCommand,
) => Promise<readonly SavedTabsParentCategoryDto[]>

/**
 * `ReorderDomainsInCategoryUseCase` を生成する。
 *
 * 責務 (issue #525):
 * 1. UI 側の `TabGroup[]` を `TabGroupId[]` に変換する。
 * 2. domain `CategoryDomainOrderingService.reorderDomainsInCategory` で
 *    対象カテゴリの `domains` 順序を組み替える。
 * 3. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す。
 * 4. 更新後のカテゴリを application DTO に変換して返す。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleUpdateDomainsOrder` 内の
 * - 対象カテゴリ検索
 * - `domains` の組み替え
 * - `reorderParentCategoriesUseCase` 直叩き
 *
 * を 1 つの application use-case に統合する。
 */
export const createReorderDomainsInCategoryUseCase = (
  deps: ReorderDomainsInCategoryUseCaseDeps,
): ReorderDomainsInCategoryUseCase => {
  return async (command) => {
    const allCategories = await deps.parentCategoryRepository.findAll()
    const collections = command.updatedDomains.map((group) => ({
      domain: createDomainName(
        normalizeDomainString(tabGroupDomainName(group)),
      ),
      id: createTabGroupId(group.id),
    }))
    const { updatedCategories } = reorderDomainsInCategory({
      categories: allCategories,
      categoryId: command.categoryId,
      collections,
    })
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories.map(toSavedTabsParentCategoryDto)
  }
}

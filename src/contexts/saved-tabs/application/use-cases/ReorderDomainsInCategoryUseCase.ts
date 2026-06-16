import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { reorderDomainsInCategory } from '../../domain/services/CategoryDomainOrderingService'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import type { ReorderDomainsInCategoryCommand } from '../commands/ReorderDomainsInCategoryCommand'

/**
 * `ReorderDomainsInCategoryUseCase` が依存する repository 群。
 */
export interface ReorderDomainsInCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `ReorderDomainsInCategoryUseCase` の関数型。
 *
 * 成功時は更新後の domain 形 `ParentCategory[]` を返す。`categoryId` が
 * `categories` 中に存在しない場合は no-op として現在値を返す（旧
 * `useCategoryManagement.handleUpdateDomainsOrder` の挙動と一致）。
 */
export type ReorderDomainsInCategoryUseCase = (
  command: ReorderDomainsInCategoryCommand,
) => Promise<readonly ParentCategory[]>

/**
 * `ReorderDomainsInCategoryUseCase` を生成する。
 *
 * 責務 (issue #525):
 * 1. UI 側の `TabGroup[]` を `TabGroupId[]` に変換する。
 * 2. domain `CategoryDomainOrderingService.reorderDomainsInCategory` で
 *    対象カテゴリの `domains` 順序を組み替える。
 * 3. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す。
 * 4. 更新後の domain 形 `ParentCategory[]` を presentation 側へ返す。
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
    const domainIds = command.updatedDomains.map((domain) =>
      createTabGroupId(domain.id),
    )
    const { updatedCategories } = reorderDomainsInCategory({
      categories: allCategories,
      categoryId: command.categoryId,
      domainIds,
    })
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories
  }
}

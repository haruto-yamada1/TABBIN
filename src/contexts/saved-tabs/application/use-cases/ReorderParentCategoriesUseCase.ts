import type { ReorderParentCategoriesCommand } from '@/contexts/saved-tabs/application/commands/ReorderParentCategoriesCommand'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'

/**
 * `ReorderParentCategoriesUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface ReorderParentCategoriesUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `ReorderParentCategoriesUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type ReorderParentCategoriesUseCase = (
  command: ReorderParentCategoriesCommand,
) => Promise<void>

/**
 * `ReorderParentCategoriesUseCase` を生成する。
 *
 * 責務:
 * 1. UI 側で並び替えた `ParentCategory[]` を
 *    `parentCategoryRepository.saveAll` に委譲する。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleConfirmCategoryReorder` 内の
 * `categoryAssignmentPort.saveParentCategories` 直叩きを
 * use-case 経由へ置換する (issue #519)。
 */
export const createReorderParentCategoriesUseCase = (
  deps: ReorderParentCategoriesUseCaseDeps,
): ReorderParentCategoriesUseCase => {
  return async (command) => {
    const categories: ParentCategory[] = command.categories.map((category) =>
      createParentCategory({
        domainNames: category.domainNames,
        domains: category.domains,
        id: category.id,
        name: category.name,
      }),
    )
    await deps.parentCategoryRepository.saveAll(categories)
  }
}

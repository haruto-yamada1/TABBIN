import type { RenameParentCategoryCommand } from '@/contexts/saved-tabs/application/commands/RenameParentCategoryCommand'
import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { parentCategoryById } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `RenameParentCategoryUseCase` が依存する repository 群。
 */
export interface RenameParentCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `RenameParentCategoryUseCase` の関数型。
 *
 * 成功時は更新後の `ParentCategory` 配列を返す。
 * 対象カテゴリが見つからない場合は `SavedTabsDomainError` を投げる。
 */
export type RenameParentCategoryUseCase = (
  command: RenameParentCategoryCommand,
) => Promise<readonly SavedTabsParentCategoryDto[]>

/**
 * `RenameParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. `parentCategoryRepository.findAll` で全 `ParentCategory` を取得する
 * 2. 対象カテゴリの `name` を `command.newName` で差し替える
 *    (`domainNames` / `domains` は保持する)
 * 3. 対象カテゴリが見つからない場合は `SavedTabsDomainError` を投げる
 * 4. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryGroupState.ts`
 * 内の `handleCategoryUpdate` (and `confirmCategorySaved`) の use-case 化。
 * presentation 層から `chrome.storage.local.get/set` の直叩きを撤去する
 * 目的 (issue #502)。
 */
export const createRenameParentCategoryUseCase = (
  deps: RenameParentCategoryUseCaseDeps,
): RenameParentCategoryUseCase => {
  return async (command) => {
    const targetCategoryId = createParentCategoryId(command.categoryId)
    const allCategories = await deps.parentCategoryRepository.findAll()
    const targetCategory = parentCategoryById(allCategories, targetCategoryId)
    if (!targetCategory) {
      throw new SavedTabsDomainError(
        '指定された ParentCategory が見つかりません',
        'PARENT_CATEGORY_NOT_FOUND',
      )
    }
    if (targetCategory.name === command.newName) {
      return allCategories.map(toSavedTabsParentCategoryDto)
    }
    const updatedCategories = allCategories.map((category) =>
      category.id === targetCategoryId
        ? {
            ...category,
            name: createCategoryName(command.newName),
          }
        : category,
    )
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories.map(toSavedTabsParentCategoryDto)
  }
}

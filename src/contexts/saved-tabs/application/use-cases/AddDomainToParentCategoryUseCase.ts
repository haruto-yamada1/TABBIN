import type { AddDomainToParentCategoryCommand } from '@/contexts/saved-tabs/application/commands/AddDomainToParentCategoryCommand'
import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { parentCategoryById } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * `AddDomainToParentCategoryUseCase` が依存する repository 群。
 */
export type AddDomainToParentCategoryUseCaseDeps = {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `AddDomainToParentCategoryUseCase` の関数型。
 *
 * 成功時は更新後の `ParentCategory` 配列を返す。
 * 対象カテゴリが見つからない / 既に同 domain が含まれている場合は
 * `SavedTabsDomainError` を投げる。
 */
export type AddDomainToParentCategoryUseCase = (
  command: AddDomainToParentCategoryCommand,
) => Promise<readonly SavedTabsParentCategoryDto[]>

/**
 * `AddDomainToParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. `parentCategoryRepository.findAll` で全 `ParentCategory` を取得する
 * 2. 対象カテゴリの `domains` / `domainNames` に新しい domain を追加する
 * 3. 既に同 domain (`domainId` または `domainName`) が含まれている場合は
 *    `SavedTabsDomainError` を投げる
 * 4. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.tsx`
 * の `updateCategoryWithDomain` の use-case 化 (issue #502)。
 */
export const createAddDomainToParentCategoryUseCase = (
  deps: AddDomainToParentCategoryUseCaseDeps,
): AddDomainToParentCategoryUseCase => {
  return async (command) => {
    const targetCategoryId: ParentCategoryId = createParentCategoryId(
      command.categoryId,
    )
    const domainId = createTabGroupId(command.domainId)
    const domainName = createDomainName(command.domainName)
    const allCategories = await deps.parentCategoryRepository.findAll()
    const targetCategory = parentCategoryById(allCategories, targetCategoryId)
    if (!targetCategory) {
      throw new SavedTabsDomainError(
        '指定された ParentCategory が見つかりません',
        'PARENT_CATEGORY_NOT_FOUND',
      )
    }
    if (
      targetCategory.collections.some(
        ({ domain, id }) => id === domainId || domain === domainName,
      )
    ) {
      throw new SavedTabsDomainError(
        'このドメインは既にカテゴリに追加されています',
        'INVALID_PARENT_CATEGORY',
      )
    }
    const updatedCategories = allCategories.map((category) =>
      category.id === targetCategoryId
        ? {
            ...category,
            collections: [
              ...category.collections,
              { domain: domainName, id: domainId },
            ],
          }
        : category,
    )
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories.map(toSavedTabsParentCategoryDto)
  }
}

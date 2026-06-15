import { parentCategoryById } from '../../domain/entities/ParentCategory'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { AddDomainToParentCategoryCommand } from '../commands/AddDomainToParentCategoryCommand'

/**
 * `AddDomainToParentCategoryUseCase` が依存する repository 群。
 */
export interface AddDomainToParentCategoryUseCaseDeps {
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
) => Promise<readonly ParentCategory[]>

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
    const allCategories = await deps.parentCategoryRepository.findAll()
    const targetCategory = parentCategoryById(allCategories, targetCategoryId)
    if (!targetCategory) {
      throw new SavedTabsDomainError(
        '指定された ParentCategory が見つかりません',
        'PARENT_CATEGORY_NOT_FOUND',
      )
    }
    if (targetCategory.domains.includes(command.domainId)) {
      throw new SavedTabsDomainError(
        'このドメインは既にカテゴリに追加されています',
        'INVALID_PARENT_CATEGORY',
      )
    }
    if (targetCategory.domainNames.includes(command.domainName)) {
      throw new SavedTabsDomainError(
        'このドメインは既にカテゴリに追加されています',
        'INVALID_PARENT_CATEGORY',
      )
    }
    const updatedCategories = allCategories.map((category) =>
      category.id === targetCategoryId
        ? {
            ...category,
            domainNames: [...category.domainNames, command.domainName],
            domains: [...category.domains, command.domainId],
          }
        : category,
    )
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories
  }
}

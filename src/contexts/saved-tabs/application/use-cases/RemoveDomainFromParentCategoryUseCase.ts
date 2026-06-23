import type { RemoveDomainFromParentCategoryCommand } from '@/contexts/saved-tabs/application/commands/RemoveDomainFromParentCategoryCommand'
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
 * `RemoveDomainFromParentCategoryUseCase` が依存する repository 群。
 */
export interface RemoveDomainFromParentCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `RemoveDomainFromParentCategoryUseCase` の関数型。
 *
 * 成功時は更新後の `ParentCategory` 配列を返す。
 * 対象カテゴリが見つからない / 対象 domain が含まれていない場合は
 * `SavedTabsDomainError` を投げる。
 */
export type RemoveDomainFromParentCategoryUseCase = (
  command: RemoveDomainFromParentCategoryCommand,
) => Promise<readonly SavedTabsParentCategoryDto[]>

/**
 * `RemoveDomainFromParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. `parentCategoryRepository.findAll` で全 `ParentCategory` を取得する
 * 2. 対象カテゴリの `domains` / `domainNames` から指定 domain を削除する
 * 3. 対象カテゴリが見つからない / domain が含まれていない場合は
 *    `SavedTabsDomainError` を投げる
 * 4. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.tsx`
 * の `handleRemoveDomain` の use-case 化 (issue #502)。
 */
export const createRemoveDomainFromParentCategoryUseCase = (
  deps: RemoveDomainFromParentCategoryUseCaseDeps,
): RemoveDomainFromParentCategoryUseCase => {
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
    const filteredDomains = targetCategory.domains.filter(
      (currentDomainId) => currentDomainId !== domainId,
    )
    const filteredDomainNames = targetCategory.domainNames.filter(
      (name) => name !== domainName,
    )
    const hasDomainId = targetCategory.domains.includes(domainId)
    const hasDomainName = targetCategory.domainNames.includes(domainName)
    if (!hasDomainId && !hasDomainName) {
      throw new SavedTabsDomainError(
        'このドメインは対象カテゴリに登録されていません',
        'INVALID_PARENT_CATEGORY',
      )
    }
    const updatedCategories = allCategories.map((category) =>
      category.id === targetCategoryId
        ? {
            ...category,
            domainNames: filteredDomainNames,
            domains: filteredDomains,
          }
        : category,
    )
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories.map(toSavedTabsParentCategoryDto)
  }
}

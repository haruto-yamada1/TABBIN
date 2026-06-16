import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { moveDomainBetweenCategories } from '../../domain/services/CategoryDomainMoveService'
import { createDomainName } from '../../domain/value-objects/DomainName'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import type { MoveDomainBetweenCategoriesCommand } from '../commands/MoveDomainBetweenCategoriesCommand'

/**
 * `MoveDomainBetweenCategoriesUseCase` が依存する repository 群。
 */
export interface MoveDomainBetweenCategoriesUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `MoveDomainBetweenCategoriesUseCase` の関数型。
 *
 * 成功時は更新後の domain 形 `ParentCategory[]` を返す。
 * `command.tabGroups` から対象 `domainId` が見つからない場合は
 * `moved=false` 相当の結果（カテゴリを一切変更しない）を返す（旧
 * `useCategoryManagement.handleMoveDomainToCategory` の挙動と一致）。
 */
export type MoveDomainBetweenCategoriesUseCase = (
  command: MoveDomainBetweenCategoriesCommand,
) => Promise<readonly ParentCategory[]>

/**
 * `MoveDomainBetweenCategoriesUseCase` を生成する。
 *
 * 責務 (issue #525):
 * 1. `command.tabGroups` から `command.domainId` 一致の `TabGroup.domain`
 *    を引き、`DomainName` 化する。
 * 2. domain `CategoryDomainMoveService.moveDomainBetweenCategories` で
 *    カテゴリ配列の `domains` / `domainNames` を更新する。
 * 3. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す。
 * 4. 更新後の domain 形 `ParentCategory[]` を presentation 側へ返す。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleMoveDomainToCategory` 内の
 * - `tabGroups` 引き当て
 * - 移動元カテゴリの `domains` / `domainNames` 削除
 * - 移動先カテゴリの `domains` / `domainNames` 追加
 * - `reorderParentCategoriesUseCase` 直叩き
 *
 * を 1 つの application use-case に統合する。
 */
export const createMoveDomainBetweenCategoriesUseCase = (
  deps: MoveDomainBetweenCategoriesUseCaseDeps,
): MoveDomainBetweenCategoriesUseCase => {
  return async (command) => {
    const allCategories = await deps.parentCategoryRepository.findAll()
    const domainGroup = command.tabGroups.find(
      (group) => group.id === command.domainId,
    )
    if (!domainGroup) {
      return allCategories
    }
    const { updatedCategories } = moveDomainBetweenCategories({
      categories: allCategories,
      domainId: createTabGroupId(command.domainId),
      domainName: createDomainName(domainGroup.domain),
      fromCategoryId: command.fromCategoryId,
      toCategoryId: command.toCategoryId,
    })
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories
  }
}

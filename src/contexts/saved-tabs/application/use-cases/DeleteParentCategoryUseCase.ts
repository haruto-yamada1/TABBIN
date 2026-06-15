import { parentCategoryById } from '../../domain/entities/ParentCategory'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { DomainCategoryMappingRepository } from '../../domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'

/**
 * `DeleteParentCategoryUseCase` の入力。
 *
 * 削除対象カテゴリの ID のみを受け取る。影響を受けるドメイン-親カテゴリ
 * マッピングは use-case 内で `DomainCategoryMappingRepository` から
 * 自動削除する。
 */
export interface DeleteParentCategoryCommand {
  readonly categoryId: string
}

export interface DeleteParentCategoryResult {
  readonly all: readonly ParentCategory[]
  readonly removedCategory: ParentCategory
}

/**
 * `DeleteParentCategoryUseCase` の関数型。削除後の `ParentCategory` 配列と
 * 削除対象エンティティを返す。presentation 層は `all` を state に反映する。
 */
export type DeleteParentCategoryUseCase = (
  command: DeleteParentCategoryCommand,
) => Promise<DeleteParentCategoryResult>

/**
 * `DeleteParentCategoryUseCase` が必要とする依存。
 */
export interface DeleteParentCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
}

/**
 * `DeleteParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. 既存カテゴリ一覧を `parentCategoryRepository.findAll` で取得する
 * 2. 対象カテゴリが見つからない場合は `SavedTabsDomainError` を投げる
 * 3. 対象を除外したカテゴリ配列で `parentCategoryRepository.saveAll`
 * 4. `DomainCategoryMappingRepository.findAll` で対象 `categoryId` を
 *    参照しているマッピングを取り除き `saveAll`
 *
 * 旧 `src/lib/storage/categories.deleteParentCategory` の DDD use-case 化
 * (issue #509)。
 */
export const createDeleteParentCategoryUseCase = (
  deps: DeleteParentCategoryUseCaseDeps,
): DeleteParentCategoryUseCase => {
  return async (command) => {
    const targetCategoryId: ParentCategoryId = createParentCategoryId(
      command.categoryId,
    )
    const all = await deps.parentCategoryRepository.findAll()
    const targetCategory = parentCategoryById(all, targetCategoryId)
    if (!targetCategory) {
      throw new SavedTabsDomainError(
        `指定された ParentCategory が見つかりません: ${command.categoryId}`,
        'PARENT_CATEGORY_NOT_FOUND',
      )
    }
    const remaining = all.filter((category) => category.id !== targetCategoryId)
    await deps.parentCategoryRepository.saveAll(remaining)

    const mappings = await deps.domainCategoryMappingRepository.findAll()
    const filteredMappings = mappings.filter(
      (mapping) => mapping.categoryId !== command.categoryId,
    )
    if (filteredMappings.length !== mappings.length) {
      await deps.domainCategoryMappingRepository.saveAll(filteredMappings)
    }

    return {
      all: remaining,
      removedCategory: targetCategory,
    }
  }
}

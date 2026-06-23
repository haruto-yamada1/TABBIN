import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { parentCategoryById } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `DeleteParentCategoryUseCase` の入力。
 *
 * 削除対象カテゴリの ID のみを受け取る。
 */
export interface DeleteParentCategoryCommand {
  readonly categoryId: string
}

export interface DeleteParentCategoryResult {
  readonly all: readonly SavedTabsParentCategoryDto[]
  readonly removedCategory: SavedTabsParentCategoryDto
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
 *
 * `ParentCategoryRepository` のみを必要とする最小形 (issue #518)。
 * 旧 `DomainCategoryMappingRepository` の cleanup は行わず、
 * `parentCategoryRepository.removeByIds` と同じ最小削除挙動を維持する
 * （presentation 側の既存挙動との互換性確保）。
 */
export interface DeleteParentCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `DeleteParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. 既存カテゴリ一覧を `parentCategoryRepository.findAll` で取得する
 * 2. 対象カテゴリが見つからない場合は `SavedTabsDomainError` を投げる
 * 3. 対象を除外したカテゴリ配列で `parentCategoryRepository.saveAll` する
 *
 * 旧 `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.tsx`
 * の `parentCategoryRepository.removeByIds` 直叩きを use-case 経由へ置換する
 * (issue #518)。`DomainCategoryMappingRepository` の cleanup は行わない
 * （既存挙動の維持）。
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

    return {
      all: remaining.map(toSavedTabsParentCategoryDto),
      removedCategory: toSavedTabsParentCategoryDto(targetCategory),
    }
  }
}

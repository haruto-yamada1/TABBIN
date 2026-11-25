import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { parentCategoryById } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `DeleteParentCategoryUseCase` の入力。
 *
 * 削除対象カテゴリの ID のみを受け取る。`requireEmpty` が true の場合、
 * 対象カテゴリにドメインの割り当てがあると削除を拒否する
 * (issue #898: 空カテゴリ整理専用)。未指定時は従来どおり割り当てが
 * あっても削除する（親カテゴリ管理モーダルの削除は割り当て解除を伴う
 * 既存挙動のため、そちらは拒否しない）。
 */
export type DeleteParentCategoryCommand = {
  readonly categoryId: string
  readonly requireEmpty?: boolean
}

export type DeleteParentCategoryResult = {
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
export type DeleteParentCategoryUseCaseDeps = {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `DeleteParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. 既存カテゴリ一覧を `parentCategoryRepository.findAll` で取得する
 * 2. 対象カテゴリが見つからない場合は `SavedTabsDomainError` を投げる
 * 3. `requireEmpty` 指定時は、対象カテゴリにドメインの割り当てが
 *    ある場合に削除を拒否する（空カテゴリ整理の前提が崩れた場合の
 *    誤削除を防ぐ。親カテゴリ管理モーダルからの削除は対象外）
 * 4. 対象を除外したカテゴリ配列で `parentCategoryRepository.saveAll` する
 *
 * 3 の再確認は保存直前にも行う。`findAll` と `saveAll` の間に別操作が
 * 割り込むと読み取った一覧が古くなるため、保存直前に再読込し、対象に
 * 割り当てが増えていない場合に限り更新する。保存機構に条件付き保存が
 * ないため完全な原子性はないが、同一ページ内の並行操作による
 * 読み取り-書き込み競合はこの再確認で防げる。
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
    const assertCategoryIsEmpty = (category: ParentCategory): void => {
      if (category.collections.length > 0) {
        throw new SavedTabsDomainError(
          `ドメインが割り当てられている ParentCategory は削除できません: ${command.categoryId}`,
          'PARENT_CATEGORY_NOT_EMPTY',
        )
      }
    }
    const all = await deps.parentCategoryRepository.findAll()
    const targetCategory = parentCategoryById(all, targetCategoryId)
    if (!targetCategory) {
      throw new SavedTabsDomainError(
        `指定された ParentCategory が見つかりません: ${command.categoryId}`,
        'PARENT_CATEGORY_NOT_FOUND',
      )
    }
    if (command.requireEmpty === true) {
      assertCategoryIsEmpty(targetCategory)
    }
    const remaining = all.filter((category) => category.id !== targetCategoryId)
    if (command.requireEmpty === true) {
      const latest = await deps.parentCategoryRepository.findAll()
      const latestTarget = parentCategoryById(latest, targetCategoryId)
      if (!latestTarget) {
        throw new SavedTabsDomainError(
          `指定された ParentCategory が見つかりません: ${command.categoryId}`,
          'PARENT_CATEGORY_NOT_FOUND',
        )
      }
      assertCategoryIsEmpty(latestTarget)
    }
    await deps.parentCategoryRepository.saveAll(remaining)

    return {
      all: remaining.map(toSavedTabsParentCategoryDto),
      removedCategory: toSavedTabsParentCategoryDto(targetCategory),
    }
  }
}

import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { ReorderParentCategoriesCommand } from '../commands/ReorderParentCategoriesCommand'

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
    // `@/types/storage.ParentCategory` から
    // domain `ParentCategory` (branded id / name / domain names) への
    // widening は既存 use-case 群と同じ storage 層との branded
    // 差異吸収パターン (issue #511)。`saveAll` 自体は
    // chrome-storage 実装側で `TabGroup` / `ParentCategory` の
    // structural 互換を受け入れる。
    await deps.parentCategoryRepository.saveAll(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- storage 層 ParentCategory と domain 層 ParentCategory の branded 差異
      command.categories as unknown as readonly ParentCategory[],
    )
  }
}

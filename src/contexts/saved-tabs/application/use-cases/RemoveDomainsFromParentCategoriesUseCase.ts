import type { RemoveDomainsFromParentCategoriesCommand } from '@/contexts/saved-tabs/application/commands/RemoveDomainsFromParentCategoriesCommand'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * `RemoveDomainsFromParentCategoriesUseCase` が依存する repository 群。
 */
export interface RemoveDomainsFromParentCategoriesUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `RemoveDomainsFromParentCategoriesUseCase` の関数型。
 *
 * 成功時は domain 形 `ParentCategory[]` を返す。`domainIds` が空の場合は
 * 何もせずに現在値をそのまま返す。対象 domain がどのカテゴリにも
 * 含まれていない場合も no-op として現在値を返す (旧
 * `removeDomainFromParentCategories` の挙動を踏襲する)。
 *
 * domain `ParentCategory` を返しているのは issue #511 で確立された
 * application 層 convention に従うため。presentation 側で
 * `setCategories` に渡す storage 形への widening は
 * `as unknown as` キャストまたは issue #511 の mapper 経由で行う。
 */
export type RemoveDomainsFromParentCategoriesUseCase = (
  command: RemoveDomainsFromParentCategoriesCommand,
) => Promise<readonly ParentCategory[]>

/**
 * `RemoveDomainsFromParentCategoriesUseCase` を生成する。
 *
 * 責務 (issue #523):
 * 1. `parentCategoryRepository.findAll` で全 `ParentCategory` を取得する
 * 2. 各 `ParentCategory.domains` から `command.domainIds` に含まれる
 *    `TabGroupId` を取り除く
 * 3. `parentCategoryRepository.saveAll` で全カテゴリを書き戻す
 * 4. 更新後の domain 形 `ParentCategory[]` を presentation 側へ返す
 *
 * 旧 `src/contexts/saved-tabs/presentation/app/SavedTabsApp.tsx` 内の
 * 以下の 2 箇所を use-case 経由へ置換する:
 * - `removeDomainFromParentCategories` (単一 TabGroup 削除後)
 * - `handleDeleteGroups` 末尾の `deps.parentCategoryRepository.saveAll`
 *   (一括 TabGroup 削除後)
 *
 * 旧挙動との互換性:
 * - `domainNames` は変更しない (旧 `removeDomainFromParentCategories` と同じく
 *   `domains` のみを操作する)。
 * - 該当 ID がどのカテゴリにも含まれない場合は no-op として成功する。
 * - 副作用は `parentCategories` 1 つの storage key のみ。
 */
export const createRemoveDomainsFromParentCategoriesUseCase = (
  deps: RemoveDomainsFromParentCategoriesUseCaseDeps,
): RemoveDomainsFromParentCategoriesUseCase => {
  return async (command) => {
    const allCategories = await deps.parentCategoryRepository.findAll()
    if (command.domainIds.length === 0) {
      return allCategories
    }
    const idSet = new Set<TabGroupId>(command.domainIds)
    const updatedCategories = allCategories.map((category) => ({
      ...category,
      domains: category.domains.filter((domainId) => !idSet.has(domainId)),
    }))
    await deps.parentCategoryRepository.saveAll(updatedCategories)
    return updatedCategories
  }
}

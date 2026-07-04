import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { normalizeDomainString } from '@/contexts/saved-tabs/domain/value-objects/DomainName'

/**
 * `CategoryAssignmentPort` の `parentCategoryRepository` /
 * `tabGroupRepository` 委譲実装 (issue #510)。
 *
 * presentation 層 (`useCategoryManagement` / `useDomainCardState` /
 * `useCategoryKeywordModal` / `SavedTabsApp`) が repository を直接
 * 触らずに saveAll 相当の永続化を行うための thin facade。
 *
 * 専用 use-case 化は過剰なため (entity バリデーションが緩く storage
 * shape への写像は `ChromeParentCategoryRepository.saveAll` /
 * `ChromeTabGroupRepository.saveAll` 内の mapper が担う)、
 * 単純な infrastructure adapter で十分としている。
 */
export const createLibCategoryAssignmentPort = (deps: {
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly tabGroupRepository: TabGroupRepository
}): CategoryAssignmentPort => ({
  saveParentCategories: async (categories) => {
    await deps.parentCategoryRepository.saveAll(
      categories.map(createParentCategory),
    )
  },
  saveTabGroups: async (tabGroups) => {
    await deps.tabGroupRepository.saveAll(
      tabGroups.map((group) =>
        // 保存フローが `https://example.com` のようにスキーム付き domain を
        // 書き込む既存データと互換するため、toDomainTabGroupFromStorage /
        // toTabGroupFromRaw / RepairTabGroupParentCategoryIdsUseCase と同じく
        // createTabGroup 入口で hostname へ正規化する。
        createTabGroup({
          ...group,
          domain: normalizeDomainString(group.domain),
          urlIds: group.urlIds ?? [],
        }),
      ),
    )
  },
})

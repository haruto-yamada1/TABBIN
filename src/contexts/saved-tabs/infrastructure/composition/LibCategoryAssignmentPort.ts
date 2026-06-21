import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

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
 * 単純な委譲で十分としている。
 */
export const createLibCategoryAssignmentPort = (deps: {
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly tabGroupRepository: TabGroupRepository
}): CategoryAssignmentPort => ({
  saveParentCategories: async (categories) => {
    await deps.parentCategoryRepository.saveAll(categories)
  },
  saveTabGroups: async (tabGroups) => {
    await deps.tabGroupRepository.saveAll(tabGroups)
  },
})

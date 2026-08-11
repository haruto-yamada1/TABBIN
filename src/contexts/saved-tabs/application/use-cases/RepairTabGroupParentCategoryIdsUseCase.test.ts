import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { toSavedTabsDisplayTabGroupDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createRepairTabGroupParentCategoryIdsUseCase } from './RepairTabGroupParentCategoryIdsUseCase'
import type { RepairTabGroupParentCategoryIdsUseCaseDeps } from './RepairTabGroupParentCategoryIdsUseCase'

type Repositories = RepairTabGroupParentCategoryIdsUseCaseDeps & {
  tabGroups: ReturnType<typeof createTabGroup>[]
  parentCategories: ReturnType<typeof createParentCategory>[]
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    parentCategories?: ReturnType<typeof createParentCategory>[]
  } = {},
): Repositories => {
  const tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  const parentCategories: ReturnType<typeof createParentCategory>[] = [
    ...(initial.parentCategories ?? []),
  ]
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: async () => null,
    findRawTabGroupById: async () => null,

    removeByIds: async () => undefined,

    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: async () => [...parentCategories],

    findById: async (id) =>
      parentCategories.find((category) => category.id === id) ?? null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
  }
  return {
    parentCategories,
    parentCategoryRepository,
    tabGroupRepository,
    tabGroups,
  }
}

describe('RepairTabGroupParentCategoryIdsUseCase', () => {
  it('ID 一致で parentCategoryId を補完し、永続化する', async () => {
    const category = createParentCategory({
      collections: [{ id: 'group-by-id', domain: 'id.example.com' }],
      id: 'cat-by-id',
      name: 'By ID',
    })
    const tabGroup = createTabGroup({
      domain: 'id.example.com',
      id: 'group-by-id',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)

    const result = await useCase({
      parentCategories: [category],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.updated).toBe(true)
    expect(result.tabGroups[0].collection.groupId).toBe('cat-by-id')
    expect(repos.tabGroups[0].collection.groupId).toBe('cat-by-id')
  })

  it('domainName 一致で parentCategoryId を補完する', async () => {
    const category = createParentCategory({
      collections: [
        { id: 'name-domain-reference', domain: 'name.example.com' },
      ],
      id: 'cat-by-name',
      name: 'By Name',
    })
    const tabGroup = createTabGroup({
      domain: 'name.example.com',
      id: 'group-by-name',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)

    const result = await useCase({
      parentCategories: [category],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.updated).toBe(true)
    expect(result.tabGroups[0].collection.groupId).toBe('cat-by-name')
  })

  it('ID 一致が優先され、domainName にはフォールバックしない', async () => {
    const idCategory = createParentCategory({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['name.example.com'][index] ?? id,
      })),
      id: 'cat-by-id',
      name: 'By ID',
    })
    const tabGroup = createTabGroup({
      domain: 'name.example.com',
      id: 'group-1',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [idCategory],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)

    const result = await useCase({
      parentCategories: [idCategory],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.tabGroups[0].collection.groupId).toBe('cat-by-id')
  })

  it('既に parentCategoryId がある場合は変更せず永続化もしない', async () => {
    const category = createParentCategory({
      collections: [{ id: 'domain-reference', domain: 'example.com' }],
      id: 'cat-1',
      name: 'Docs',
    })
    const tabGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'cat-existing',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)
    const saveAllSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')

    const result = await useCase({
      parentCategories: [category],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.updated).toBe(false)
    expect(result.tabGroups[0].collection.groupId).toBe('cat-existing')
    expect(saveAllSpy).not.toHaveBeenCalled()
  })

  it('どのカテゴリにも該当しない TabGroup はそのまま返す', async () => {
    const category = createParentCategory({
      collections: [{ id: 'other-reference', domain: 'other.example.com' }],
      id: 'cat-1',
      name: 'Other',
    })
    const tabGroup = createTabGroup({
      domain: 'unmatched.example.com',
      id: 'group-1',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)
    const saveAllSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')

    const result = await useCase({
      parentCategories: [category],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.updated).toBe(false)
    expect(result.tabGroups[0].collection.groupId).toBeUndefined()
    expect(saveAllSpy).not.toHaveBeenCalled()
  })

  it('command 未指定なら repository から取得して修復する', async () => {
    const category = createParentCategory({
      collections: [{ id: 'group-1', domain: 'example.com' }],
      id: 'cat-1',
      name: 'By ID',
    })
    const tabGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)

    const result = await useCase()

    expect(result.updated).toBe(true)
    expect(result.tabGroups[0].collection.groupId).toBe('cat-1')
  })

  it('current collection definitionのdomain名で修復する', async () => {
    const category = createParentCategory({
      collections: [{ id: 'domain-reference', domain: 'example.com' }],
      id: 'cat-1',
      name: 'Docs',
    })
    const tabGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      parentCategories: [category],
      tabGroups: [tabGroup],
    })
    const useCase = createRepairTabGroupParentCategoryIdsUseCase(repos)

    const result = await useCase({
      parentCategories: [category],
      tabGroups: [toSavedTabsDisplayTabGroupDto(tabGroup)],
    })

    expect(result.tabGroups[0].collection.groupId).toBe('cat-1')
  })
})

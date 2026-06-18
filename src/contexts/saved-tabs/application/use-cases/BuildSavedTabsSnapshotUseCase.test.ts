import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createParentCategory } from '../../domain/entities/ParentCategory'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createCustomProjectId } from '../../domain/value-objects/CustomProjectId'
import type { BuildSavedTabsSnapshotUseCaseDeps } from './BuildSavedTabsSnapshotUseCase'
import { createBuildSavedTabsSnapshotUseCase } from './BuildSavedTabsSnapshotUseCase'

interface Repositories extends BuildSavedTabsSnapshotUseCaseDeps {
  tabGroups: ReturnType<typeof createTabGroup>[]
  customProjects: ReturnType<typeof createCustomProject>[]
  customProjectOrder: ReturnType<typeof createCustomProjectId>[]
  parentCategories: ReturnType<typeof createParentCategory>[]
  urlRecords: ReturnType<typeof createUrlRecord>[]
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
    customProjectOrder?: ReturnType<typeof createCustomProjectId>[]
    parentCategories?: ReturnType<typeof createParentCategory>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
  } = {},
): Repositories => {
  const tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  const customProjects: ReturnType<typeof createCustomProject>[] = [
    ...(initial.customProjects ?? []),
  ]
  const customProjectOrder: ReturnType<typeof createCustomProjectId>[] = [
    ...(initial.customProjectOrder ?? []),
  ]
  const parentCategories: ReturnType<typeof createParentCategory>[] = [
    ...(initial.parentCategories ?? []),
  ]
  const urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...(initial.urlRecords ?? []),
  ]
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(() => Promise.resolve(null)),
    findRawTabGroupById: vi.fn(() => Promise.resolve(null)),

    removeByIds: async () => undefined,

    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    findAll: async () => [...customProjects],

    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,

    removeByIds: async () => undefined,

    saveAll: async (projects) => {
      customProjects.splice(0, customProjects.length, ...projects)
    },

    findOrder: async () => [...customProjectOrder],

    saveOrder: async (order) => {
      customProjectOrder.splice(0, customProjectOrder.length, ...order)
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: async () => [...parentCategories],

    findById: async (id) =>
      parentCategories.find((category) => category.id === id) ?? null,

    saveAll: async (categories) => {
      parentCategories.splice(0, parentCategories.length, ...categories)
    },

    removeByIds: async () => undefined,
  }
  const urlRecordRepository: UrlRecordRepository = {
    findAll: async () => [...urlRecords],

    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,

    saveAll: async (records) => {
      urlRecords.splice(0, urlRecords.length, ...records)
    },

    removeByIds: async () => undefined,
  }
  return {
    customProjectOrder,
    customProjectRepository,
    customProjects,
    parentCategories,
    parentCategoryRepository,
    tabGroupRepository,
    tabGroups,
    urlRecordRepository,
    urlRecords,
  }
}

describe('BuildSavedTabsSnapshotUseCase', () => {
  it('storage の全 state を読み取って snapshot を組み立てる', async () => {
    const tabGroups = [
      createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      }),
    ]
    const customProjects = [
      createCustomProject({
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Project 1',
        updatedAt: 1,
        urlIds: ['url-1'],
      }),
    ]
    const customProjectOrder = [createCustomProjectId('project-1')]
    const parentCategories = [
      createParentCategory({
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Cat 1',
      }),
    ]
    const urlRecords = [
      createUrlRecord({
        id: 'url-1',
        savedAt: 1,
        title: 'Example',
        url: 'https://example.com',
      }),
    ]
    const repositories = createInMemoryRepositories({
      customProjectOrder,
      customProjects,
      parentCategories,
      tabGroups,
      urlRecords,
    })
    const useCase = createBuildSavedTabsSnapshotUseCase(repositories)

    const snapshot = await useCase({})

    expect(snapshot.savedTabs).toHaveLength(1)
    expect(snapshot.savedTabs?.[0]?.id).toBe('group-1')
    expect(snapshot.customProjects).toHaveLength(1)
    expect(snapshot.customProjects?.[0]?.id).toBe('project-1')
    expect(snapshot.customProjectOrder).toStrictEqual(['project-1'])
    expect(snapshot.parentCategories).toHaveLength(1)
    expect(snapshot.parentCategories?.[0]?.id).toBe('cat-1')
    expect(snapshot.urlRecords).toHaveLength(1)
    expect(snapshot.urlRecords?.[0]?.id).toBe('url-1')
  })

  it('command.parentCategories が指定された場合は storage より優先する', async () => {
    const stored = createParentCategory({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'cat-stored',
      name: 'Stored',
    })
    const overrideCategory = createParentCategory({
      domainNames: ['other.com'],
      domains: ['group-2'],
      id: 'cat-override',
      name: 'Override',
    })
    const repositories = createInMemoryRepositories({
      parentCategories: [stored],
    })
    const useCase = createBuildSavedTabsSnapshotUseCase(repositories)

    const snapshot = await useCase({
      parentCategories: [overrideCategory],
    })

    expect(snapshot.parentCategories).toHaveLength(1)
    expect(snapshot.parentCategories?.[0]?.id).toBe('cat-override')
  })

  it('command 未指定のときは storage の parentCategories を使う', async () => {
    const stored = createParentCategory({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'cat-stored',
      name: 'Stored',
    })
    const repositories = createInMemoryRepositories({
      parentCategories: [stored],
    })
    const useCase = createBuildSavedTabsSnapshotUseCase(repositories)

    const snapshot = await useCase({})

    expect(snapshot.parentCategories).toHaveLength(1)
    expect(snapshot.parentCategories?.[0]?.id).toBe('cat-stored')
  })

  it('storage が空の場合は undefined フィールドを含む snapshot を返す', async () => {
    const repositories = createInMemoryRepositories()
    const useCase = createBuildSavedTabsSnapshotUseCase(repositories)

    const snapshot = await useCase({})

    expect(snapshot.savedTabs).toStrictEqual([])
    expect(snapshot.customProjects).toStrictEqual([])
    expect(snapshot.customProjectOrder).toStrictEqual([])
    expect(snapshot.parentCategories).toStrictEqual([])
    expect(snapshot.urlRecords).toStrictEqual([])
  })
})

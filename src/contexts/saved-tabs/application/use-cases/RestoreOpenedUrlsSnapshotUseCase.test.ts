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
import type { RestoreOpenedUrlsSnapshotUseCaseDeps } from './RestoreOpenedUrlsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from './RestoreOpenedUrlsSnapshotUseCase'

interface Repositories extends RestoreOpenedUrlsSnapshotUseCaseDeps {
  tabGroups: ReturnType<typeof createTabGroup>[]
  urlRecords: ReturnType<typeof createUrlRecord>[]
  customProjects: ReturnType<typeof createCustomProject>[]
  customProjectOrder: ReturnType<typeof createCustomProjectId>[]
  parentCategories: ReturnType<typeof createParentCategory>[]
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
    customProjectOrder?: ReturnType<typeof createCustomProjectId>[]
    parentCategories?: ReturnType<typeof createParentCategory>[]
  } = {},
): Repositories => {
  const tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  const urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...(initial.urlRecords ?? []),
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
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(() => Promise.resolve(null)),
    findRawTabGroupById: vi.fn(() => Promise.resolve(null)),

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = tabGroups.filter((group) => !idSet.has(group.id))
      tabGroups.splice(0, tabGroups.length, ...next)
    },

    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
  }
  const urlRecordRepository: UrlRecordRepository = {
    findAll: async () => [...urlRecords],

    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = urlRecords.filter((record) => !idSet.has(record.id))
      urlRecords.splice(0, urlRecords.length, ...next)
    },

    saveAll: async (records) => {
      urlRecords.splice(0, urlRecords.length, ...records)
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    findAll: async () => [...customProjects],

    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = customProjects.filter((project) => !idSet.has(project.id))
      customProjects.splice(0, customProjects.length, ...next)
    },

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

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = parentCategories.filter(
        (category) => !idSet.has(category.id),
      )
      parentCategories.splice(0, parentCategories.length, ...next)
    },

    saveAll: async (categories) => {
      parentCategories.splice(0, parentCategories.length, ...categories)
    },
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

describe('RestoreOpenedUrlsSnapshotUseCase', () => {
  it('snapshot の savedTabs / urlRecords / customProjects / parentCategories を復元する', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 1,
      urlIds: ['url-1'],
    })
    const category = createParentCategory({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'cat-1',
      name: 'Docs',
    })
    const repos = createInMemoryRepositories()
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    const result = await useCase({
      snapshot: {
        customProjects: [project],
        parentCategories: [category],
        savedTabs: [target],
        urlRecords: [url],
      },
    })

    expect(result.restoredTabGroups).toStrictEqual([target])
    expect(result.restoredUrlRecords).toStrictEqual([url])
    expect(result.restoredCustomProjects).toStrictEqual([project])
    expect(result.restoredParentCategories).toStrictEqual([category])
    expect(repos.tabGroups).toStrictEqual([target])
    expect(repos.urlRecords).toStrictEqual([url])
    expect(repos.customProjects).toStrictEqual([project])
    expect(repos.parentCategories).toStrictEqual([category])
  })

  it('既存データに snapshot と同じ ID が無ければマージ追加する', async () => {
    const existing = createTabGroup({
      domain: 'other.com',
      id: 'group-existing',
      urlIds: [],
    })
    const restored = createTabGroup({
      domain: 'example.com',
      id: 'group-restored',
      urlIds: [],
    })
    const repos = createInMemoryRepositories({ tabGroups: [existing] })
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    await useCase({ snapshot: { savedTabs: [restored] } })

    expect(repos.tabGroups.map((group) => group.id)).toStrictEqual([
      existing.id,
      restored.id,
    ])
  })

  it('既存データに snapshot と同じ ID があれば snapshot 優先で上書きする', async () => {
    const existing = createTabGroup({
      domain: 'old.example.com',
      id: 'group-1',
      urlIds: [],
    })
    const restored = createTabGroup({
      domain: 'new.example.com',
      id: 'group-1',
      urlIds: [],
    })
    const repos = createInMemoryRepositories({ tabGroups: [existing] })
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    await useCase({ snapshot: { savedTabs: [restored] } })

    expect(repos.tabGroups).toStrictEqual([restored])
  })

  it('既存 urlRecords / customProjects に snapshot と重複 ID があれば snapshot 優先で置換する', async () => {
    const existingUrl = createUrlRecord({
      id: 'url-existing',
      savedAt: 1,
      title: 'EX',
      url: 'https://example.com/existing',
    })
    const restoredUrl = createUrlRecord({
      id: 'url-existing',
      savedAt: 2,
      title: 'NEW',
      url: 'https://example.com/new',
    })
    const existingProject = createCustomProject({
      categories: ['a'],
      createdAt: 1,
      id: 'project-existing',
      name: 'Old',
      updatedAt: 1,
      urlIds: ['url-existing'],
    })
    const restoredProject = createCustomProject({
      categories: ['b'],
      createdAt: 2,
      id: 'project-existing',
      name: 'New',
      updatedAt: 2,
      urlIds: ['url-existing'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [existingProject],
      urlRecords: [existingUrl],
    })
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    await useCase({
      snapshot: {
        customProjects: [restoredProject],
        urlRecords: [restoredUrl],
      },
    })

    expect(repos.urlRecords).toStrictEqual([restoredUrl])
    expect(repos.customProjects).toStrictEqual([restoredProject])
  })

  it('snapshot が空のときは何もせず DTO にも空配列を返す', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    const result = await useCase({ snapshot: {} })

    expect(result.restoredTabGroups).toStrictEqual([])
    expect(result.restoredUrlRecords).toStrictEqual([])
    expect(result.restoredCustomProjects).toStrictEqual([])
    expect(result.restoredParentCategories).toStrictEqual([])
    expect(result.restoredCustomProjectOrder).toBeUndefined()
    expect(repos.tabGroups).toStrictEqual([])
    expect(repos.customProjectOrder).toStrictEqual([])
  })

  it('snapshot の customProjectOrder を repository 経由で保存する', async () => {
    const repos = createInMemoryRepositories({
      customProjectOrder: [
        createCustomProjectId('project-old'),
        createCustomProjectId('project-stale'),
      ],
    })
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    const result = await useCase({
      snapshot: {
        customProjectOrder: ['project-new', 'project-old', 'project-new', ''],
      },
    })

    expect(result.restoredCustomProjectOrder?.map((id) => id)).toStrictEqual([
      'project-new',
      'project-old',
    ])
    expect(repos.customProjectOrder.map((id) => id)).toStrictEqual([
      'project-new',
      'project-old',
    ])
  })

  it('snapshot に customProjectOrder が無いとき repository には書き戻さない', async () => {
    const initial = [createCustomProjectId('project-keep')]
    const repos = createInMemoryRepositories({ customProjectOrder: initial })
    const useCase = createRestoreOpenedUrlsSnapshotUseCase(repos)

    const result = await useCase({ snapshot: {} })

    expect(result.restoredCustomProjectOrder).toBeUndefined()
    expect(repos.customProjectOrder).toStrictEqual(initial)
  })
})

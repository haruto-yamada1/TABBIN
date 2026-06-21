import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

import type { DeleteTabGroupUseCaseDeps } from './DeleteTabGroupUseCase'
import { createDeleteTabGroupUseCase } from './DeleteTabGroupUseCase'

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
  } = {},
): DeleteTabGroupUseCaseDeps & {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjects: ReturnType<typeof createCustomProject>[]
} => {
  let tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  let urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...(initial.urlRecords ?? []),
  ]
  const customProjects: ReturnType<typeof createCustomProject>[] = [
    ...(initial.customProjects ?? []),
  ]
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(async () => null),

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      tabGroups = tabGroups.filter((group) => !idSet.has(group.id))
    },

    saveAll: async (groups) => {
      tabGroups = [...groups]
    },
  }
  const urlRecordRepository: UrlRecordRepository = {
    findAll: async () => [...urlRecords],

    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      urlRecords = urlRecords.filter((record) => !idSet.has(record.id))
    },

    saveAll: async (records) => {
      urlRecords = [...records]
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

    findOrder: async () => [],

    saveOrder: async () => undefined,
  }
  return {
    customProjectRepository,
    customProjects,
    tabGroupRepository,
    urlRecordRepository,
  }
}

describe('DeleteTabGroupUseCase', () => {
  it('指定した TabGroup を削除する', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2'],
    })
    const other = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: [],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const url2 = createUrlRecord({
      id: 'url-2',
      savedAt: 1,
      title: 'B',
      url: 'https://example.com/b',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [target, other],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteTabGroupUseCase(repos)

    const result = await useCase({ tabGroupId: target.id })

    expect(result.removedTabGroupId).toBe(target.id)
    const remaining = await repos.tabGroupRepository.findAll()
    expect(remaining.map((group) => group.id)).toStrictEqual([other.id])
  })

  it('他で参照されていない UrlRecord は同時に削除する', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2'],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const url2 = createUrlRecord({
      id: 'url-2',
      savedAt: 1,
      title: 'B',
      url: 'https://example.com/b',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [target],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteTabGroupUseCase(repos)

    const result = await useCase({ tabGroupId: target.id })

    expect(result.removedUrlRecordIds).toStrictEqual([url1.id, url2.id])
    const remaining = await repos.urlRecordRepository.findAll()
    expect(remaining).toStrictEqual([])
  })

  it('他の TabGroup で参照されている UrlRecord は削除しない', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-shared'],
    })
    const other = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: ['url-shared', 'url-only-other'],
    })
    const shared = createUrlRecord({
      id: 'url-shared',
      savedAt: 1,
      title: 'shared',
      url: 'https://example.com/shared',
    })
    const onlyOther = createUrlRecord({
      id: 'url-only-other',
      savedAt: 1,
      title: 'only other',
      url: 'https://other.com/x',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [target, other],
      urlRecords: [shared, onlyOther],
    })
    const useCase = createDeleteTabGroupUseCase(repos)

    const result = await useCase({ tabGroupId: target.id })

    expect(result.removedUrlRecordIds).toStrictEqual([])
    const remaining = await repos.urlRecordRepository.findAll()
    expect(remaining.map((record) => record.id)).toStrictEqual([
      shared.id,
      onlyOther.id,
    ])
  })

  it('CustomProject で参照されている UrlRecord は削除しない', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-shared'],
    })
    const shared = createUrlRecord({
      id: 'url-shared',
      savedAt: 1,
      title: 'shared',
      url: 'https://example.com/shared',
    })
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 1,
      urlIds: ['url-shared'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [target],
      urlRecords: [shared],
    })
    const useCase = createDeleteTabGroupUseCase(repos)

    const result = await useCase({ tabGroupId: target.id })

    expect(result.removedUrlRecordIds).toStrictEqual([])
  })

  it('snapshot には削除した TabGroup と UrlRecord だけを含める', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const other = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: [],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const kept = createUrlRecord({
      id: 'url-kept',
      savedAt: 1,
      title: 'K',
      url: 'https://example.com/kept',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [target, other],
      urlRecords: [url1, kept],
    })
    const useCase = createDeleteTabGroupUseCase(repos)

    const result = await useCase({ tabGroupId: target.id })

    expect(result.snapshot.savedTabs).toStrictEqual([target])
    expect(result.snapshot.urlRecords).toStrictEqual([url1])
    expect(result.snapshot.customProjects).toBeUndefined()
    expect(result.snapshot.parentCategories).toBeUndefined()
  })

  it('存在しない TabGroupId を指定すると SavedTabsDomainError を投げる', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteTabGroupUseCase(repos)

    await expect(
      useCase({ tabGroupId: 'missing' as never }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })
})

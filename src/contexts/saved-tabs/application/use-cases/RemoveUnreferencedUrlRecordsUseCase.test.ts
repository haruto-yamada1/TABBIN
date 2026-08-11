import { describe, expect, it, vi } from 'vitest'

import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import type { RemoveUnreferencedUrlRecordsUseCaseDeps } from './RemoveUnreferencedUrlRecordsUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from './RemoveUnreferencedUrlRecordsUseCase'

type Repositories = RemoveUnreferencedUrlRecordsUseCaseDeps & {
  urlRecords: ReturnType<typeof createUrlRecord>[]
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
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
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(async () => null),

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
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

    saveAll: async () => undefined,
  }
  const customProjectRepository: CustomProjectRepository = {
    findAll: async () => [...customProjects],

    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,

    findOrder: async () => [],

    saveOrder: async () => undefined,
  }
  return {
    customProjectRepository,
    tabGroupRepository,
    urlRecordRepository,
    urlRecords,
  }
}

describe('RemoveUnreferencedUrlRecordsUseCase', () => {
  it('どの TabGroup / CustomProject からも参照されていない UrlRecord を削除する', async () => {
    const referenced = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const unreferenced = createUrlRecord({
      id: 'url-orphan',
      savedAt: 1,
      title: 'B',
      url: 'https://orphan.example.com/b',
    })
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      memberships: ['url-1'].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [referenced, unreferenced],
    })
    const useCase = createRemoveUnreferencedUrlRecordsUseCase(repos)

    const result = await useCase()

    expect(result.removedCount).toBe(1)
    expect(result.removedUrlRecordIds).toStrictEqual([unreferenced.id])
    expect(repos.urlRecords.map((record) => record.id)).toStrictEqual([
      referenced.id,
    ])
  })

  it('CustomProject からの参照がある UrlRecord は削除しない', async () => {
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 1,
      memberships: ['url-orphan'].map((urlId) => ({ urlId })),
    })
    const unreferenced = createUrlRecord({
      id: 'url-orphan',
      savedAt: 1,
      title: 'B',
      url: 'https://orphan.example.com/b',
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      urlRecords: [unreferenced],
    })
    const useCase = createRemoveUnreferencedUrlRecordsUseCase(repos)

    const result = await useCase()

    expect(result.removedCount).toBe(0)
    expect(result.removedUrlRecordIds).toStrictEqual([])
  })

  it('未参照 URL が無い場合は空 DTO を返し、repository を呼ばない', async () => {
    const referenced = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      memberships: ['url-1'].map((urlId) => ({ urlId })),
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [referenced],
    })
    const removeSpy = vi.spyOn(repos.urlRecordRepository, 'removeByIds')
    const useCase = createRemoveUnreferencedUrlRecordsUseCase(repos)

    const result = await useCase()

    expect(result.removedCount).toBe(0)
    expect(result.removedUrlRecordIds).toStrictEqual([])
    expect(removeSpy).not.toHaveBeenCalled()
  })
})

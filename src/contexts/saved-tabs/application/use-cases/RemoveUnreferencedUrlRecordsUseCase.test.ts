import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { RemoveUnreferencedUrlRecordsUseCaseDeps } from './RemoveUnreferencedUrlRecordsUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from './RemoveUnreferencedUrlRecordsUseCase'

interface Repositories extends RemoveUnreferencedUrlRecordsUseCaseDeps {
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
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [...tabGroups],
    // eslint-disable-next-line typescript/require-await
    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(() => Promise.resolve(null)),
    findRawTabGroupById: vi.fn(() => Promise.resolve(null)),
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const urlRecordRepository: UrlRecordRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [...urlRecords],
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = urlRecords.filter((record) => !idSet.has(record.id))
      urlRecords.splice(0, urlRecords.length, ...next)
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const customProjectRepository: CustomProjectRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [...customProjects],
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    findOrder: async () => [],
    // eslint-disable-next-line typescript/require-await
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
      urlIds: ['url-1'],
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
      urlIds: ['url-orphan'],
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
      urlIds: ['url-1'],
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

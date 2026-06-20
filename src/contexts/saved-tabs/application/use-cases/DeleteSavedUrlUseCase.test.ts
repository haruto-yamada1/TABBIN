import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { DeleteSavedUrlUseCaseDeps } from './DeleteSavedUrlUseCase'
import { createDeleteSavedUrlUseCase } from './DeleteSavedUrlUseCase'

interface Repositories {
  tabGroupRepository: TabGroupRepository
  urlRecordRepository: UrlRecordRepository
  customProjectRepository: CustomProjectRepository
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
  } = {},
): Repositories & DeleteSavedUrlUseCaseDeps => {
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

    removeByIds: async () => undefined,

    saveAll: async (projects) => {
      customProjects.splice(0, customProjects.length, ...projects)
    },

    findOrder: async () => [],

    saveOrder: async () => undefined,
  }
  return {
    customProjectRepository,
    tabGroupRepository,
    urlRecordRepository,
  }
}

describe('DeleteSavedUrlUseCase', () => {
  it('指定した URL を TabGroup と UrlRecord から削除する', async () => {
    const group = createTabGroup({
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
      tabGroups: [group],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteSavedUrlUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      url: 'https://example.com/a',
    })

    expect(result.removedUrlRecordId).toBe('url-1')
    expect(result.removedUrlRecord?.id).toBe('url-1')
    expect(result.removedTabGroupId).toBeNull()
    expect(result.snapshot).not.toBeNull()
    const remaining = await repos.tabGroupRepository.findAll()
    expect(remaining[0].urlIds).toStrictEqual(['url-2'])
    const remainingRecords = await repos.urlRecordRepository.findAll()
    expect(remainingRecords.map((record) => record.id)).toStrictEqual(['url-2'])
  })

  it('最後の URL を削除した場合は TabGroup も削除する', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [url1],
    })
    const useCase = createDeleteSavedUrlUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      url: 'https://example.com/a',
    })

    expect(result.removedUrlRecordId).toBe('url-1')
    expect(result.removedTabGroupId).toBe(group.id)
    await expect(repos.tabGroupRepository.findAll()).resolves.toStrictEqual([])
  })

  it('CustomProject からも url id を取り除き、UrlRecord も未参照なら削除する', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const project = createCustomProject({
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'P',
      updatedAt: 1,
      urlIds: ['url-1'],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url1],
    })
    const useCase = createDeleteSavedUrlUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      url: 'https://example.com/a',
    })

    // group / project の双方から url-1 を取り除き、参照箇所が無くなるため
    // UrlRecord も削除される。group の urlIds が空になるので group 自体も削除。
    expect(result.removedUrlRecordId).toBe('url-1')
    expect(result.removedTabGroupId).toBe(group.id)
    expect(result.removedUrlRecord?.id).toBe('url-1')
    expect(result.snapshot).not.toBeNull()
    expect(result.snapshot?.customProjects).toContainEqual(project)
    await expect(repos.tabGroupRepository.findAll()).resolves.toStrictEqual([])
    const remainingProjects = await repos.customProjectRepository.findAll()
    expect(remainingProjects[0].urlIds).toStrictEqual([])
    const remainingRecords = await repos.urlRecordRepository.findAll()
    expect(remainingRecords.map((record) => record.id)).toStrictEqual([])
  })

  it('別 group が同じ UrlRecord を参照している場合は削除しない', async () => {
    const targetGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const otherGroup = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: ['url-1'],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [targetGroup, otherGroup],
      urlRecords: [url1],
    })
    const useCase = createDeleteSavedUrlUseCase(repos)

    const result = await useCase({
      tabGroupId: targetGroup.id,
      url: 'https://example.com/a',
    })

    // 他 group から参照されているので UrlRecord は残す。
    // targetGroup 単体では urlIds が空になるので group 自体は削除。
    expect(result.removedUrlRecordId).toBeNull()
    expect(result.removedTabGroupId).toBe(targetGroup.id)
    const remainingTabGroups = await repos.tabGroupRepository.findAll()
    expect(remainingTabGroups.map((g) => g.id)).toStrictEqual([otherGroup.id])
    const remainingRecords = await repos.urlRecordRepository.findAll()
    expect(remainingRecords.map((record) => record.id)).toStrictEqual(['url-1'])
  })

  it('TabGroup に該当 URL が無い場合は no-op', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-2'],
    })
    const url1 = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [url1],
    })
    const useCase = createDeleteSavedUrlUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      url: 'https://example.com/a',
    })

    expect(result.removedUrlRecordId).toBeNull()
    expect(result.snapshot).toBeNull()
    const remainingTabGroups = await repos.tabGroupRepository.findAll()
    expect(remainingTabGroups[0].urlIds).toStrictEqual(['url-2'])
  })

  it('存在しない TabGroup のときは SavedTabsDomainError を投げる', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteSavedUrlUseCase(repos)

    await expect(
      useCase({
        tabGroupId: 'missing' as never,
        url: 'https://example.com/a',
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })

  it('UrlRecord に登録されていない URL のときは SavedTabsDomainError を投げる', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: [],
    })
    const repos = createInMemoryRepositories({ tabGroups: [group] })
    const useCase = createDeleteSavedUrlUseCase(repos)

    await expect(
      useCase({
        tabGroupId: group.id,
        url: 'https://example.com/a',
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })
})

import { describe, expect, it } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { DeleteSavedUrlsUseCaseDeps } from './DeleteSavedUrlsUseCase'
import { createDeleteSavedUrlsUseCase } from './DeleteSavedUrlsUseCase'

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
): Repositories & DeleteSavedUrlsUseCaseDeps => {
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
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = tabGroups.filter((group) => !idSet.has(group.id))
      tabGroups.splice(0, tabGroups.length, ...next)
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
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
    saveAll: async (records) => {
      urlRecords.splice(0, urlRecords.length, ...records)
    },
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
    saveAll: async (projects) => {
      customProjects.splice(0, customProjects.length, ...projects)
    },
    // eslint-disable-next-line typescript/require-await
    findOrder: async () => [],
    // eslint-disable-next-line typescript/require-await
    saveOrder: async () => undefined,
  }
  return {
    customProjectRepository,
    tabGroupRepository,
    urlRecordRepository,
  }
}

describe('DeleteSavedUrlsUseCase', () => {
  it('指定した URL を TabGroup と UrlRecord から一括削除する', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2', 'url-3'],
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
    const url3 = createUrlRecord({
      id: 'url-3',
      savedAt: 1,
      title: 'C',
      url: 'https://example.com/c',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [url1, url2, url3],
    })
    const useCase = createDeleteSavedUrlsUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(result.removedUrlRecordIds).toStrictEqual(['url-1', 'url-2'])
    expect(result.removedUrlRecords.map((r) => r.id)).toStrictEqual([
      'url-1',
      'url-2',
    ])
    expect(result.removedTabGroupIds).toStrictEqual([])
    const remainingTabGroups = await repos.tabGroupRepository.findAll()
    expect(remainingTabGroups[0].urlIds).toStrictEqual(['url-3'])
    const remainingRecords = await repos.urlRecordRepository.findAll()
    expect(remainingRecords.map((record) => record.id)).toStrictEqual(['url-3'])
  })

  it('全 URL を削除した場合は TabGroup も削除する', async () => {
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
    const useCase = createDeleteSavedUrlsUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(result.removedTabGroupIds).toStrictEqual([group.id])
    await expect(repos.tabGroupRepository.findAll()).resolves.toStrictEqual([])
  })

  it('CustomProject からも url id を取り除き、未参照なら UrlRecord を削除する', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2'],
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
    const url2 = createUrlRecord({
      id: 'url-2',
      savedAt: 1,
      title: 'B',
      url: 'https://example.com/b',
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteSavedUrlsUseCase(repos)

    const result = await useCase({
      tabGroupId: group.id,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    // group / project 双方から url-1 / url-2 を取り除き、参照が無くなった
    // ため UrlRecord も両方削除される。group は urlIds が空になり削除。
    expect(result.removedUrlRecordIds).toStrictEqual(['url-1', 'url-2'])
    expect(result.removedTabGroupIds).toStrictEqual([group.id])
    expect(result.snapshot).not.toBeNull()
    expect(result.snapshot?.customProjects).toContainEqual(project)
    expect(
      (await repos.urlRecordRepository.findAll()).map((record) => record.id),
    ).toStrictEqual([])
    const remainingProjects = await repos.customProjectRepository.findAll()
    expect(remainingProjects[0].urlIds).toStrictEqual([])
  })

  it('別 group が同じ UrlRecord を参照している場合はその UrlRecord を残す', async () => {
    const targetGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2'],
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
    const url2 = createUrlRecord({
      id: 'url-2',
      savedAt: 1,
      title: 'B',
      url: 'https://example.com/b',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [targetGroup, otherGroup],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteSavedUrlsUseCase(repos)

    const result = await useCase({
      tabGroupId: targetGroup.id,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    // url-1 は otherGroup からの参照があるため残す。url-2 は単独で削除。
    expect(result.removedUrlRecordIds).toStrictEqual(['url-2'])
    expect(result.removedTabGroupIds).toStrictEqual([targetGroup.id])
    expect(
      (await repos.urlRecordRepository.findAll()).map((record) => record.id),
    ).toStrictEqual(['url-1'])
  })

  it('空配列のときは port を呼ばず早期 return する', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteSavedUrlsUseCase(repos)

    const result = await useCase({
      tabGroupId: 'group-1' as never,
      urls: [],
    })

    expect(result.snapshot).toBeNull()
    expect(result.removedUrlRecordIds).toStrictEqual([])
    expect(result.removedTabGroupIds).toStrictEqual([])
  })

  it('存在しない TabGroup のときは SavedTabsDomainError を投げる', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteSavedUrlsUseCase(repos)

    await expect(
      useCase({
        tabGroupId: 'missing' as never,
        urls: ['https://example.com/a'],
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })

  it('UrlRecord に 1 件も該当が無いときは SavedTabsDomainError を投げる', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: [],
    })
    const repos = createInMemoryRepositories({ tabGroups: [group] })
    const useCase = createDeleteSavedUrlsUseCase(repos)

    await expect(
      useCase({
        tabGroupId: group.id,
        urls: ['https://example.com/a'],
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })
})

import { describe, expect, it } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { DeleteTabGroupsUseCaseDeps } from './DeleteTabGroupsUseCase'
import { createDeleteTabGroupsUseCase } from './DeleteTabGroupsUseCase'

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
): Repositories & DeleteTabGroupsUseCaseDeps => {
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

describe('DeleteTabGroupsUseCase', () => {
  it('指定した複数の TabGroup を一括で削除する', async () => {
    const group1 = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const group2 = createTabGroup({
      domain: 'foo.com',
      id: 'group-2',
      urlIds: ['url-2'],
    })
    const other = createTabGroup({
      domain: 'other.com',
      id: 'group-3',
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
      url: 'https://foo.com/b',
    })
    const repos = createInMemoryRepositories({
      tabGroups: [group1, group2, other],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteTabGroupsUseCase(repos)

    const result = await useCase({
      tabGroupIds: [group1.id, group2.id],
    })

    expect(result.removedTabGroupIds).toStrictEqual([group1.id, group2.id])
    expect(result.removedUrlRecordIds).toStrictEqual(['url-1', 'url-2'])
    expect(result.snapshot.savedTabs).toStrictEqual([group1, group2])
    expect(
      (await repos.tabGroupRepository.findAll()).map((group) => group.id),
    ).toStrictEqual([other.id])
    await expect(repos.urlRecordRepository.findAll()).resolves.toStrictEqual([])
  })

  it('存在しない ID は無視し、見つかったものだけ削除する', async () => {
    const target = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const repos = createInMemoryRepositories({
      tabGroups: [target],
      urlRecords: [
        createUrlRecord({
          id: 'url-1',
          savedAt: 1,
          title: 'A',
          url: 'https://example.com/a',
        }),
      ],
    })
    const useCase = createDeleteTabGroupsUseCase(repos)

    const result = await useCase({
      tabGroupIds: [target.id, 'non-existent' as typeof target.id],
    })

    expect(result.removedTabGroupIds).toStrictEqual([target.id])
    expect(
      (await repos.tabGroupRepository.findAll()).map((group) => group.id),
    ).toStrictEqual([])
  })

  it('他で参照されている UrlRecord は削除せず残す', async () => {
    const target = createTabGroup({
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
      urlIds: ['url-2'],
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
      tabGroups: [target],
      urlRecords: [url1, url2],
    })
    const useCase = createDeleteTabGroupsUseCase(repos)

    const result = await useCase({ tabGroupIds: [target.id] })

    expect(result.removedUrlRecordIds).toStrictEqual(['url-1'])
    expect(
      (await repos.urlRecordRepository.findAll()).map((record) => record.id),
    ).toStrictEqual(['url-2'])
  })

  it('空配列のときは no-op で空の snapshot を返す', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteTabGroupsUseCase(repos)

    const result = await useCase({ tabGroupIds: [] })

    expect(result.removedTabGroupIds).toStrictEqual([])
    expect(result.removedUrlRecordIds).toStrictEqual([])
    expect(result.snapshot.savedTabs).toStrictEqual([])
  })

  it('storage 上に 1 件も対象が無いときは SavedTabsDomainError を投げる', async () => {
    const repos = createInMemoryRepositories()
    const useCase = createDeleteTabGroupsUseCase(repos)

    await expect(
      useCase({ tabGroupIds: ['missing' as never] }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { BrowserTabPort } from '../ports/BrowserTabPort'
import { createOpenSavedUrlUseCase } from './OpenSavedUrlUseCase'

interface Repositories {
  tabGroupRepository: TabGroupRepository
  urlRecordRepository: UrlRecordRepository
  customProjectRepository: CustomProjectRepository
  tabGroups: ReturnType<typeof createTabGroup>[]
  urlRecords: ReturnType<typeof createUrlRecord>[]
  customProjects: ReturnType<typeof createCustomProject>[]
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
    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = customProjects.filter((project) => !idSet.has(project.id))
      customProjects.splice(0, customProjects.length, ...next)
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (projects) => {
      customProjects.splice(0, customProjects.length, ...projects)
    },
  }
  return {
    customProjectRepository,
    customProjects,
    tabGroupRepository,
    tabGroups,
    urlRecordRepository,
    urlRecords,
  }
}

const createSpyBrowserTabPort = (): {
  port: BrowserTabPort
  opened: { url: string }[]
} => {
  const opened: { url: string }[] = []
  const port: BrowserTabPort = {
    // eslint-disable-next-line typescript/require-await
    open: async (input) => {
      opened.push(input)
      return { url: input.url }
    },
  }
  return { opened, port }
}

const baseSettings = {
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
}

describe('OpenSavedUrlUseCase', () => {
  it('BrowserTabPort.open を呼び出して URL を開く', async () => {
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({ urlRecords: [url] })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: baseSettings,
      urlRecordId: url.id,
    })

    expect(browser.opened).toStrictEqual([{ url: 'https://example.com/a' }])
    expect(result.openedUrl).toBe('https://example.com/a')
  })

  it('設定 OFF のときは UrlRecord を削除せず snapshot も null', async () => {
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const repos = createInMemoryRepositories({ urlRecords: [url] })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: baseSettings,
      urlRecordId: url.id,
    })

    expect(result.removedUrlRecordId).toBeNull()
    expect(result.removedUrlRecord).toBeNull()
    expect(result.snapshot).toBeNull()
    expect(repos.urlRecords.map((record) => record.id)).toStrictEqual([url.id])
  })

  it('設定 ON のときは該当 UrlRecord を TabGroup から外し、UrlRecord も削除する', async () => {
    const url = createUrlRecord({
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
      urlRecords: [url],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: url.id,
    })

    expect(result.removedUrlRecordId).toBe(url.id)
    expect(result.removedUrlRecord?.id).toBe(url.id)
    expect(result.snapshot).not.toBeNull()
    expect(repos.urlRecords).toStrictEqual([])
    // 空になった TabGroup は removeUrlRecordIdsFromTabGroups 側で除外される
    expect(repos.tabGroups).toStrictEqual([])
  })

  it('他で参照されている UrlRecord は削除しない（CustomProject 参照）', async () => {
    const url = createUrlRecord({
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
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 1,
      urlIds: ['url-1'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: url.id,
    })

    expect(result.removedUrlRecordId).toBeNull()
    expect(repos.urlRecords.map((record) => record.id)).toStrictEqual([url.id])
    expect(repos.tabGroups).toStrictEqual([])
    // CustomProject 側にまだ参照があるので、saveAll は呼ばれない（変化なし）
    expect(repos.customProjects.map((project) => project.id)).toStrictEqual([
      project.id,
    ])
  })

  it('他で参照されている UrlRecord は削除しない（別 TabGroup 参照）', async () => {
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const sourceGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const otherGroup = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: ['url-1'],
    })
    const repos = createInMemoryRepositories({
      tabGroups: [sourceGroup, otherGroup],
      urlRecords: [url],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: url.id,
    })

    expect(result.removedUrlRecordId).toBeNull()
    expect(repos.urlRecords.map((record) => record.id)).toStrictEqual([url.id])
  })

  it('externalDrop のときは removeTabAfterExternalDrop 設定を参照する', async () => {
    const url = createUrlRecord({
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
      urlRecords: [url],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'externalDrop',
      settings: { ...baseSettings, removeTabAfterExternalDrop: true },
      urlRecordId: url.id,
    })

    expect(result.removedUrlRecordId).toBe(url.id)
  })

  it('CustomProject の urlIds が一部だけ削除対象なら更新して保存する', async () => {
    const urlToOpen = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const urlKept = createUrlRecord({
      id: 'url-2',
      savedAt: 1,
      title: 'B',
      url: 'https://example.com/b',
    })
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1', 'url-2'],
    })
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-1',
      name: 'Project',
      updatedAt: 1,
      urlIds: ['url-1', 'url-2'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [urlToOpen, urlKept],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: urlToOpen.id,
    })

    // urlIds から url-1 だけ削除された状態になる
    const afterProject = repos.customProjects[0]
    expect(afterProject?.urlIds).toStrictEqual([urlKept.id])
  })

  it('CustomProject にしか参照されていない UrlRecord も削除する', async () => {
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
    const repos = createInMemoryRepositories({
      customProjects: [project],
      urlRecords: [url],
    })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: url.id,
    })

    // UrlRecord 自体は CustomProject のみからの参照なので削除される
    expect(result.removedUrlRecordId).toBe(url.id)
    expect(repos.urlRecords).toStrictEqual([])
  })

  it('関係ない CustomProject は変更しない（残 project の urlIds はそのまま）', async () => {
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const otherUrl = createUrlRecord({
      id: 'url-other',
      savedAt: 1,
      title: 'B',
      url: 'https://other.example.com/b',
    })
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const unrelatedProject = createCustomProject({
      categories: ['research'],
      createdAt: 1,
      id: 'project-unrelated',
      name: 'Unrelated',
      updatedAt: 1,
      urlIds: ['url-other'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [unrelatedProject],
      tabGroups: [group],
      urlRecords: [url, otherUrl],
    })
    const saveSpy = vi.spyOn(repos.customProjectRepository, 'saveAll')
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: url.id,
    })

    // 関係ない CustomProject は変化しないので saveAll は呼ばれない
    expect(saveSpy).not.toHaveBeenCalled()
    expect(repos.customProjects[0]?.urlIds).toStrictEqual([otherUrl.id])
  })

  it('どの TabGroup / CustomProject からも参照されていない UrlRecord も削除する', async () => {
    const orphan = createUrlRecord({
      id: 'url-orphan',
      savedAt: 1,
      title: 'O',
      url: 'https://orphan.example.com/',
    })
    const repos = createInMemoryRepositories({ urlRecords: [orphan] })
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    const result = await useCase({
      origin: 'click',
      settings: { ...baseSettings, removeTabAfterOpen: true },
      urlRecordId: orphan.id,
    })

    expect(result.removedUrlRecordId).toBe(orphan.id)
    expect(repos.urlRecords).toStrictEqual([])
  })

  it('存在しない UrlRecordId を指定すると SavedTabsDomainError を投げる', async () => {
    const repos = createInMemoryRepositories()
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    await expect(
      useCase({
        origin: 'click',
        settings: baseSettings,
        urlRecordId: 'missing' as never,
      }),
    ).rejects.toBeInstanceOf(SavedTabsDomainError)
    // 開かない
    expect(browser.opened).toStrictEqual([])
  })
})

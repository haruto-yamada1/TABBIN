import { describe, expect, it, vi } from 'vitest'

import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

import { createOpenSavedUrlUseCase } from './OpenSavedUrlUseCase'

type Repositories = {
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

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = customProjects.filter((project) => !idSet.has(project.id))
      customProjects.splice(0, customProjects.length, ...next)
    },

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

  it('TabGroup から URL を一つだけ削除してグループ自体は残る場合も saveAll が呼ばれる', async () => {
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
    const repos = createInMemoryRepositories({
      tabGroups: [group],
      urlRecords: [urlToOpen, urlKept],
    })
    const saveSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')
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

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(repos.tabGroups[0]?.urlIds).toStrictEqual([urlKept.id])
  })

  it('TabGroup の内容が変わらないときは saveAll を呼ばない', async () => {
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
    const saveSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')
    const browser = createSpyBrowserTabPort()
    const useCase = createOpenSavedUrlUseCase({
      ...repos,
      browserTabPort: browser.port,
    })

    // 設定 OFF なので削除も saveAll も走らない
    await useCase({
      origin: 'click',
      settings: baseSettings,
      urlRecordId: url.id,
    })

    expect(saveSpy).not.toHaveBeenCalled()
  })
})

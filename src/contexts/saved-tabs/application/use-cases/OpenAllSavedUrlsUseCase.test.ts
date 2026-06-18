import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { BrowserTabPort } from '../ports/BrowserTabPort'
import type { BrowserWindowPort } from '../ports/BrowserWindowPort'
import { createOpenAllSavedUrlsUseCase } from './OpenAllSavedUrlsUseCase'

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
  return { customProjectRepository, tabGroupRepository, urlRecordRepository }
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

const createSpyBrowserWindowPort = (): {
  port: BrowserWindowPort
  opened: { urls: readonly string[]; focused?: boolean }[]
} => {
  const opened: { urls: readonly string[]; focused?: boolean }[] = []
  const port: BrowserWindowPort = {
    // eslint-disable-next-line typescript/require-await
    openWithUrls: vi.fn(async (input) => {
      opened.push({ focused: input.focused, urls: [...input.urls] })
      return { urls: [...input.urls] }
    }),
  }
  return { opened, port }
}

describe('OpenAllSavedUrlsUseCase', () => {
  it('mode=backgroundTabs のときは BrowserTabPort.open を各 URL で呼び出す', async () => {
    const repos = createInMemoryRepositories()
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: false,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(tab.opened).toStrictEqual([
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
    ])
    expect(win.opened).toStrictEqual([])
    expect(result.openedUrls).toStrictEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
    expect(result.snapshot).toBeNull()
  })

  it('mode=newWindow のときは BrowserWindowPort.openWithUrls を 1 度だけ呼ぶ', async () => {
    const repos = createInMemoryRepositories()
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    await useCase({
      mode: 'newWindow',
      removeTabAfterOpen: false,
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(win.opened).toStrictEqual([
      {
        focused: true,
        urls: ['https://example.com/a', 'https://example.com/b'],
      },
    ])
    expect(tab.opened).toStrictEqual([])
  })

  it('設定 OFF のときは TabGroup / CustomProject / UrlRecord を変更しない', async () => {
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
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'P',
      updatedAt: 1,
      urlIds: ['url-1'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url],
    })
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: false,
      urls: ['https://example.com/a'],
    })

    expect(result.removedUrlRecordIds).toStrictEqual([])
    expect(result.removedUrlRecords).toStrictEqual([])
    expect(result.snapshot).toBeNull()
    expect((await repos.tabGroupRepository.findAll())[0].urlIds).toStrictEqual([
      'url-1',
    ])
    expect(
      (await repos.customProjectRepository.findAll())[0].urlIds,
    ).toStrictEqual(['url-1'])
    expect(
      (await repos.urlRecordRepository.findAll()).map((r) => r.id),
    ).toStrictEqual(['url-1'])
  })

  it('設定 ON のときは TabGroup / CustomProject / UrlRecord から削除する', async () => {
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
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'P',
      updatedAt: 1,
      urlIds: ['url-1'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url],
    })
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: true,
      urls: ['https://example.com/a'],
    })

    expect(result.removedUrlRecordIds).toStrictEqual(['url-1'])
    expect(result.removedUrlRecords[0].id).toBe('url-1')
    expect(result.snapshot).not.toBeNull()
    await expect(repos.tabGroupRepository.findAll()).resolves.toStrictEqual([])
    await expect(
      repos.customProjectRepository.findAll(),
    ).resolves.toStrictEqual([{ ...project, urlIds: [] }])
    await expect(repos.urlRecordRepository.findAll()).resolves.toStrictEqual([])
  })

  it('ブラウザが URL を正規化して返しても要求元の保存 URL を削除する', async () => {
    const url = createUrlRecord({
      id: 'url-1',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com',
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
    const browserTabPort: BrowserTabPort = {
      // Chrome は origin のみの URL に末尾スラッシュを付けて返す。
      // eslint-disable-next-line typescript/require-await
      open: vi.fn(async () => ({ url: 'https://example.com/' })),
    }
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: true,
      urls: ['https://example.com'],
    })

    expect(result.openedUrls).toStrictEqual(['https://example.com/'])
    expect(result.removedUrlRecordIds).toStrictEqual(['url-1'])
    await expect(repos.tabGroupRepository.findAll()).resolves.toStrictEqual([])
    await expect(repos.urlRecordRepository.findAll()).resolves.toStrictEqual([])
  })

  it('他で参照されている UrlRecord は削除せず残す', async () => {
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
      urlIds: ['url-1', 'url-2'],
    })
    const repos = createInMemoryRepositories({
      customProjects: [project],
      tabGroups: [group],
      urlRecords: [url1, url2],
    })
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    // 開くのは url-1 のみ。url-1 は group / project 双方から除去され未参照になるので削除される。
    // url-2 は引き続き group / project に残るので未参照にならず保持される。
    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: true,
      urls: ['https://example.com/a'],
    })

    expect(result.removedUrlRecordIds).toStrictEqual(['url-1'])
    expect(result.snapshot).not.toBeNull()
    const remainingTabGroups = await repos.tabGroupRepository.findAll()
    expect(remainingTabGroups[0].urlIds).toStrictEqual(['url-2'])
    const remainingProjects = await repos.customProjectRepository.findAll()
    expect(remainingProjects[0].urlIds).toStrictEqual(['url-2'])
    const remainingRecords = await repos.urlRecordRepository.findAll()
    expect(remainingRecords.map((record) => record.id)).toStrictEqual(['url-2'])
  })

  it('UrlRecord に存在しない URL は無視する', async () => {
    const repos = createInMemoryRepositories()
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: true,
      urls: ['https://unknown.example.com/'],
    })

    expect(result.openedUrls).toStrictEqual(['https://unknown.example.com/'])
    expect(result.removedUrlRecordIds).toStrictEqual([])
    expect(result.snapshot).toBeNull()
  })

  it('空 URL 配列のときは port を呼ばず早期 return する', async () => {
    const repos = createInMemoryRepositories()
    const tab = createSpyBrowserTabPort()
    const win = createSpyBrowserWindowPort()
    const useCase = createOpenAllSavedUrlsUseCase({
      ...repos,
      browserTabPort: tab.port,
      browserWindowPort: win.port,
    })

    const result = await useCase({
      mode: 'backgroundTabs',
      removeTabAfterOpen: true,
      urls: [],
    })

    expect(tab.opened).toStrictEqual([])
    expect(win.opened).toStrictEqual([])
    expect(result.openedUrls).toStrictEqual([])
    expect(result.snapshot).toBeNull()
  })
})

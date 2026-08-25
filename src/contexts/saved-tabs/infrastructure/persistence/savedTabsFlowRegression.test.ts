import { describe, expect, it, vi } from 'vitest'

import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '@/contexts/saved-tabs/application/ports/BrowserWindowPort'
import type { NotificationPort } from '@/contexts/saved-tabs/application/ports/NotificationPort'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { searchSavedTabs } from '@/contexts/saved-tabs/domain/services/SavedTabsSearchService'

import { createChromeCustomProjectRepository } from './chrome-storage/ChromeCustomProjectRepository'
import { createChromeDomainCategoryMappingRepository } from './chrome-storage/ChromeDomainCategoryMappingRepository'
import { createChromeDomainCategorySettingsRepository } from './chrome-storage/ChromeDomainCategorySettingsRepository'
import { createChromeParentCategoryRepository } from './chrome-storage/ChromeParentCategoryRepository'
import { createLibRemoveSubCategoryFromTabGroupAdapter } from './chrome-storage/ChromeRemoveSubCategoryFromTabGroupAdapter'
import { createLibSetCategoryKeywordsAdapter } from './chrome-storage/ChromeSetCategoryKeywordsAdapter'
import {
  createChromeSavedTabsTabGroupReadAdapter,
  createChromeTabGroupRepository,
} from './chrome-storage/ChromeTabGroupRepository'
import type { ChromeStorageLocalPort } from './chrome-storage/ChromeUrlRecordRepository'
import { createChromeUrlRecordRepository } from './chrome-storage/ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from './chrome-storage/ChromeUserSettingsRepository'
import {
  CUSTOM_PROJECTS_KEY,
  PARENT_CATEGORIES_KEY,
  SAVED_TABS_KEY,
  URLS_KEY,
} from './chrome-storage/savedTabsStorageKeys'

type StorageState = Record<string, unknown>

const createPort = (state: StorageState): ChromeStorageLocalPort => {
  // mock 内で await しない同期関数を async として書くため lint ルールを局所的に解除する
  /* eslint-disable typescript/require-await */
  return {
    get: vi.fn(async (key: string) => ({ [key]: state[key] })),
    remove: vi.fn(async (key: string) => {
      delete state[key]
    }),
    set: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(state, value)
    }),
  }
  /* eslint-enable typescript/require-await */
}

type SpyBrowserTabPort = {
  readonly port: BrowserTabPort
  readonly open: ReturnType<typeof vi.fn>
  readonly opened: { active: boolean; url: string }[]
}

const createSpyBrowserTabPort = (
  resolveActive: () => boolean,
): SpyBrowserTabPort => {
  const opened: { active: boolean; url: string }[] = []
  const open = vi.fn(async (input: { url: string }) => {
    opened.push({ active: resolveActive(), url: input.url })
    return { url: input.url }
  })
  return {
    open,
    opened,
    port: { open },
  }
}

type SpyBrowserWindowPort = {
  readonly port: BrowserWindowPort
  readonly openWithUrls: ReturnType<typeof vi.fn>
  readonly opened: { focused?: boolean; urls: readonly string[] }[]
}

const createSpyBrowserWindowPort = (): SpyBrowserWindowPort => {
  const opened: { focused?: boolean; urls: readonly string[] }[] = []
  const openWithUrls = vi.fn(
    async (input: { urls: readonly string[]; focused?: boolean }) => {
      opened.push({
        ...(input.focused !== undefined ? { focused: input.focused } : {}),
        urls: [...input.urls],
      })
      return { urls: [...input.urls] }
    },
  )
  return {
    openWithUrls,
    opened,
    port: { openWithUrls },
  }
}

const createCaptureNotificationPort = (): {
  notificationPort: NotificationPort
  calls: { level: 'error' | 'info' | 'success'; message: string }[]
} => {
  const calls: { level: 'error' | 'info' | 'success'; message: string }[] = []
  const push =
    (level: 'error' | 'info' | 'success') => (input: { message: string }) => {
      calls.push({ level, message: input.message })
    }
  return {
    calls,
    notificationPort: {
      error: push('error'),
      info: push('info'),
      success: push('success'),
    },
  }
}

type Bundle = {
  readonly deps: SavedTabsUseCasesDeps
  readonly port: ChromeStorageLocalPort
  readonly portState: StorageState
  readonly browserTabPort: SpyBrowserTabPort
  readonly browserWindowPort: SpyBrowserWindowPort
  readonly notificationPort: ReturnType<typeof createCaptureNotificationPort>
  readonly useCases: ReturnType<typeof createSavedTabsUseCases>
}

const createBundle = (initial: StorageState = {}): Bundle => {
  const state: StorageState = { ...initial }
  const port = createPort(state)
  const browserTabPort = createSpyBrowserTabPort(() => true)
  const browserWindowPort = createSpyBrowserWindowPort()
  const notification = createCaptureNotificationPort()
  const deps: SavedTabsUseCasesDeps = {
    browserTabPort: browserTabPort.port,
    clock: { now: () => 0 },
    idGenerator: { generate: () => 'test-id' },
    browserWindowPort: browserWindowPort.port,
    categoriesCommandService: {
      updateCollectionCategories: vi.fn().mockResolvedValue(undefined),
    },
    categoryAssignmentPort: {
      saveParentCategories: vi.fn().mockResolvedValue(undefined),
      saveTabGroups: vi.fn().mockResolvedValue(undefined),
    },
    customProjectRepository: createChromeCustomProjectRepository(port),
    customProjectsCommandService: {
      addCategoryToProject: vi.fn().mockResolvedValue(undefined),
      addUrlToCustomProject: vi.fn().mockResolvedValue(undefined),
      moveUrlBetweenCustomProjects: vi.fn().mockResolvedValue(undefined),
      removeCategoryFromProject: vi.fn().mockResolvedValue(undefined),
      removeUrlFromCustomProject: vi.fn().mockResolvedValue(undefined),
      removeUrlIdsFromAllCustomProjects: vi.fn().mockResolvedValue(undefined),
      removeUrlsFromAllCustomProjects: vi.fn().mockResolvedValue(undefined),
      removeUrlsFromCustomProject: vi.fn().mockResolvedValue(undefined),
      renameCategoryInProject: vi.fn().mockResolvedValue(undefined),
      reorderProjectUrls: vi.fn().mockResolvedValue(undefined),
      setUrlCategory: vi.fn().mockResolvedValue(undefined),
      updateCategoryOrder: vi.fn().mockResolvedValue(undefined),
      updateProjectKeywords: vi.fn().mockResolvedValue(undefined),
    },
    domainCategoryMappingRepository:
      createChromeDomainCategoryMappingRepository(port),
    domainCategorySettingsRepository:
      createChromeDomainCategorySettingsRepository(port),
    migrationPort: {
      migrateParentCategoriesToDomainNames: vi
        .fn()
        .mockResolvedValue(undefined),
      migrateToUrlsStorage: vi.fn().mockResolvedValue(undefined),
      migrateDomainStorageToHostname: vi.fn().mockResolvedValue(undefined),
    },
    notificationPort: notification.notificationPort,
    parentCategoryRepository: createChromeParentCategoryRepository(port),
    removeSubCategoryFromTabGroupPort:
      createLibRemoveSubCategoryFromTabGroupAdapter(),
    savedTabsTabGroupReadPort: createChromeSavedTabsTabGroupReadAdapter(port),
    setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    storageChangePort: {
      subscribe: () => () => {},
    },
    messagingPort: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    tabGroupRepository: createChromeTabGroupRepository(port),
    urlRecordRepository: createChromeUrlRecordRepository(port),
    userSettingsRepository: createChromeUserSettingsRepository(port),
  }
  return {
    browserTabPort,
    browserWindowPort,
    deps,
    notificationPort: notification,
    port,
    portState: state,
    useCases: createSavedTabsUseCases(deps),
  }
}

const buildLegacyFixture = (): StorageState => {
  // 旧 `src/lib/storage/*` と同じ chrome.storage 形式を再現する
  // フィクスチャ。rich な補助フィールド（urlSubCategories / subCategories /
  // categoryKeywords など）を含め、DDD 移行で捨てられても writeback で
  // 持ち越されることを保証する。
  return {
    [CUSTOM_PROJECTS_KEY]: [
      {
        categories: ['research'],
        createdAt: 1_700_000_000_000,
        id: 'project-research',
        name: 'Q4 Research',
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['research'],
          urlKeywords: ['paper'],
        },
        updatedAt: 1_700_000_000_500,
        urlIds: ['url-shared'],
        urlMetadata: {
          'url-shared': { category: 'research', notes: 'shared note' },
        },
        urls: [
          {
            category: 'research',
            notes: 'shared note',
            savedAt: 1_700_000_000_000,
            title: 'Shared Article',
            url: 'https://example.com/shared',
          },
        ],
      },
    ],
    [PARENT_CATEGORIES_KEY]: [
      {
        domains: ['group-example'],
        domainNames: ['example.com'],
        id: 'cat-docs',
        name: 'Docs',
      },
      {
        domains: ['group-other'],
        domainNames: ['other.com'],
        id: 'cat-news',
        name: 'News',
      },
    ],
    [SAVED_TABS_KEY]: [
      {
        categoryKeywords: [{ categoryName: 'docs', keywords: ['doc', 'spec'] }],
        domain: 'https://example.com',
        id: 'group-example',
        parentCategoryId: 'cat-docs',
        savedAt: 1_700_000_000_000,
        subCategories: ['docs'],
        subCategoryOrder: ['docs'],
        subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
        urlIds: ['url-shared', 'url-example-only'],
        urls: [
          {
            id: 'url-shared',
            savedAt: 1_700_000_000_000,
            subCategory: 'docs',
            title: 'Shared Article',
            url: 'https://example.com/shared',
          },
          {
            id: 'url-example-only',
            savedAt: 1_700_000_000_100,
            subCategory: 'docs',
            title: 'Example Only',
            url: 'https://example.com/only',
          },
        ],
        urlSubCategories: {
          'url-example-only': 'docs',
          'url-shared': 'docs',
        },
      },
      {
        domain: 'https://other.com',
        id: 'group-other',
        parentCategoryId: 'cat-news',
        savedAt: 1_700_000_000_200,
        urlIds: ['url-other-1'],
        urls: [
          {
            id: 'url-other-1',
            savedAt: 1_700_000_000_200,
            title: 'Other 1',
            url: 'https://other.com/1',
          },
        ],
      },
    ],
    [URLS_KEY]: [
      {
        favIconUrl: 'https://example.com/favicon.ico',
        id: 'url-shared',
        savedAt: 1_700_000_000_000,
        title: 'Shared Article',
        url: 'https://example.com/shared',
      },
      {
        id: 'url-example-only',
        savedAt: 1_700_000_000_100,
        title: 'Example Only',
        url: 'https://example.com/only',
      },
      {
        id: 'url-other-1',
        savedAt: 1_700_000_000_200,
        title: 'Other 1',
        url: 'https://other.com/1',
      },
    ],
  }
}

describe('savedTabs DDD 移行 後 回帰テスト', () => {
  describe('legacy data → repository 読み出し', () => {
    it('旧 chrome.storage の生データを repository が domain entity へ読み出せる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      const parentCategories =
        await bundle.deps.parentCategoryRepository.findAll()
      const customProjects = await bundle.deps.customProjectRepository.findAll()

      // group-example の domain は URL 形式から hostname へ正規化される
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup?.collection.definition.domain).toBe('example.com')
      expect(exampleGroup?.collection.groupId).toBe('cat-docs')
      expect(exampleGroup?.collectionCategories).toStrictEqual([
        expect.objectContaining({
          keywords: ['doc', 'spec'],
          name: 'docs',
          sortOrder: 0,
        }),
      ])
      expect(
        exampleGroup?.memberships.map(({ categoryId, urlId }) => ({
          categoryId,
          urlId,
        })),
      ).toStrictEqual([
        { categoryId: 'group-example:category:0', urlId: 'url-shared' },
        {
          categoryId: 'group-example:category:0',
          urlId: 'url-example-only',
        },
      ])
      expect(tabGroups).toHaveLength(2)
      expect(urlRecords).toHaveLength(3)
      expect(parentCategories).toHaveLength(2)
      expect(customProjects).toHaveLength(1)
      expect(
        customProjects[0]?.memberships.map(({ categoryId, notes, urlId }) => ({
          categoryId,
          notes,
          urlId,
        })),
      ).toStrictEqual([
        {
          categoryId: 'project-research:category:0',
          notes: 'shared note',
          urlId: 'url-shared',
        },
      ])
    })

    it('インポート済みの子カテゴリは D&D 並び替えとタブ open 後の再読込で維持される', async () => {
      const bundle = createBundle(buildLegacyFixture())

      const loadExampleGroup = async () => {
        const pageData = await bundle.useCases.getSavedTabsPageData()
        const exampleGroup = pageData.tabGroups.find(
          (group) => group.id === 'group-example',
        )
        expect(
          exampleGroup?.collectionCategories.map(({ name }) => name),
        ).toStrictEqual(['docs'])

        const { tabGroups } = await bundle.useCases.loadTabGroupsWithUrls({
          tabGroups: pageData.tabGroups as never,
        })
        return tabGroups.find((group) => group.id === 'group-example')
      }

      const initialGroup = await loadExampleGroup()
      expect(initialGroup?.resolvedUrls).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'url-example-only',
            subCategory: 'docs',
          }),
        ]),
      )

      await bundle.useCases.reorderTabGroupUrls({
        newUrlOrder: ['https://example.com/only', 'https://example.com/shared'],
        tabGroupId: 'group-example' as never,
      })

      const reorderedGroup = await loadExampleGroup()
      expect(reorderedGroup?.resolvedUrls).toStrictEqual([
        expect.objectContaining({
          id: 'url-example-only',
          subCategory: 'docs',
        }),
        expect.objectContaining({
          id: 'url-shared',
          subCategory: 'docs',
        }),
      ])

      await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-example-only' as never,
      })

      const reloadedGroup = await loadExampleGroup()
      expect(reloadedGroup?.resolvedUrls).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'url-example-only',
            subCategory: 'docs',
          }),
        ]),
      )
    })

    it('不正なレコードを混在させた storage でも有効 entity だけを返す', async () => {
      const state = buildLegacyFixture()
      const savedTabs = state[SAVED_TABS_KEY] as Record<string, unknown>[]
      savedTabs.push({ domain: 'broken.example.com' })
      savedTabs.push({ id: 'broken-2' })
      const bundle = createBundle(state)
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      expect(tabGroups.map((group) => group.id)).toStrictEqual([
        'group-example',
        'group-other',
      ])
    })
  })

  describe('URL open', () => {
    it('use-case が BrowserTabPort.open を呼び出して URL を開く', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(result.openedUrl).toBe('https://example.com/only')
      expect(bundle.browserTabPort.open).toHaveBeenCalledWith({
        url: 'https://example.com/only',
      })
    })

    it('openUrlInBackground 設定 (resolveActive: false) は BrowserTabPort 経由で active: false に伝搬する', async () => {
      // openUrlInBackground は chrome.tabs.create 時の `active` フラグを
      // 制御する設定。DDD 移行でこの経路が壊れていないことを確認する
      // ために、port options の resolveActive を経由して
      // chrome.tabs.create({ active, url }) の active が伝搬することを検証。
      const state = buildLegacyFixture()
      const port = createPort(state)
      const openSpy = vi.fn(async (input: { url: string }) => ({
        url: input.url,
      }))
      const resolveActive = vi.fn(() => false)
      const { createChromeBrowserTabAdapter } =
        await import('@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter')
      const { createChromeBrowserWindowAdapter } =
        await import('@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter')
      const browserTabPort = createChromeBrowserTabAdapter(
        { getApi: () => ({ tabs: { create: openSpy } }) },
        { resolveActive },
      )
      const browserWindowPort = createChromeBrowserWindowAdapter({
        getApi: () => undefined,
      })
      const notification = createCaptureNotificationPort()
      const deps: SavedTabsUseCasesDeps = {
        browserTabPort,
        clock: { now: () => 0 },
        idGenerator: { generate: () => 'test-id' },
        browserWindowPort,
        categoriesCommandService: {
          updateCollectionCategories: vi.fn().mockResolvedValue(undefined),
        },
        categoryAssignmentPort: {
          saveParentCategories: vi.fn().mockResolvedValue(undefined),
          saveTabGroups: vi.fn().mockResolvedValue(undefined),
        },
        customProjectRepository: createChromeCustomProjectRepository(port),
        customProjectsCommandService: {
          addCategoryToProject: vi.fn().mockResolvedValue(undefined),
          addUrlToCustomProject: vi.fn().mockResolvedValue(undefined),
          moveUrlBetweenCustomProjects: vi.fn().mockResolvedValue(undefined),
          removeCategoryFromProject: vi.fn().mockResolvedValue(undefined),
          removeUrlFromCustomProject: vi.fn().mockResolvedValue(undefined),
          removeUrlIdsFromAllCustomProjects: vi
            .fn()
            .mockResolvedValue(undefined),
          removeUrlsFromAllCustomProjects: vi.fn().mockResolvedValue(undefined),
          removeUrlsFromCustomProject: vi.fn().mockResolvedValue(undefined),
          renameCategoryInProject: vi.fn().mockResolvedValue(undefined),
          reorderProjectUrls: vi.fn().mockResolvedValue(undefined),
          setUrlCategory: vi.fn().mockResolvedValue(undefined),
          updateCategoryOrder: vi.fn().mockResolvedValue(undefined),
          updateProjectKeywords: vi.fn().mockResolvedValue(undefined),
        },
        domainCategoryMappingRepository:
          createChromeDomainCategoryMappingRepository(port),
        domainCategorySettingsRepository:
          createChromeDomainCategorySettingsRepository(port),
        migrationPort: {
          migrateParentCategoriesToDomainNames: vi
            .fn()
            .mockResolvedValue(undefined),
          migrateToUrlsStorage: vi.fn().mockResolvedValue(undefined),
          migrateDomainStorageToHostname: vi.fn().mockResolvedValue(undefined),
        },
        notificationPort: notification.notificationPort,
        parentCategoryRepository: createChromeParentCategoryRepository(port),
        removeSubCategoryFromTabGroupPort:
          createLibRemoveSubCategoryFromTabGroupAdapter(),
        setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
        storageChangePort: {
          subscribe: () => () => {},
        },
        messagingPort: {
          send: vi.fn().mockResolvedValue(undefined),
        },
        tabGroupRepository: createChromeTabGroupRepository(port),
        urlRecordRepository: createChromeUrlRecordRepository(port),
        userSettingsRepository: createChromeUserSettingsRepository(port),
      }
      const useCases = createSavedTabsUseCases(deps)
      await useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(resolveActive).toHaveBeenCalled()
      expect(openSpy).toHaveBeenCalledWith({
        active: false,
        url: 'https://example.com/only',
      })
    })

    it('removeTabAfterOpen=false のとき保存データを変更しない（storage に書き戻さない）', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const setSpy = bundle.port.set as ReturnType<typeof vi.fn>
      const initialSetCalls = setSpy.mock.calls.length
      await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(setSpy.mock.calls.length).toBe(initialSetCalls)
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).toContain(
        'url-example-only',
      )
    })

    it('removeTabAfterOpen=true のとき対象参照のみ削除し UrlRecord も消える', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(result.removedUrlRecordId).toBe('url-example-only')
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      // 対象 urlId だけが TabGroup から外れている
      expect(exampleGroup?.memberships.map(({ urlId }) => urlId)).toStrictEqual(
        ['url-shared'],
      )
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).not.toContain(
        'url-example-only',
      )
    })

    it('TabGroup と CustomProject の双方から外した UrlRecord を孤立させない', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: 'url-shared' as never,
      })
      expect(result.removedUrlRecordId).toBe('url-shared')
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).not.toContain('url-shared')
      // url-shared は TabGroup / CustomProject 双方からも取り除かれている
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup?.memberships.map(({ urlId }) => urlId)).not.toContain(
        'url-shared',
      )
      const customProjects = await bundle.deps.customProjectRepository.findAll()
      expect(
        customProjects[0]?.memberships.map(({ urlId }) => urlId),
      ).not.toContain('url-shared')
    })
  })

  describe('Delete', () => {
    it('単一 TabGroup を削除できる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.deleteTabGroup({
        tabGroupId: 'group-example' as never,
      })
      expect(result.removedTabGroupId).toBe('group-example')
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      expect(tabGroups.map((group) => group.id)).toStrictEqual(['group-other'])
    })

    it('CustomProject 参照がある UrlRecord は消さず、TabGroup 専用 UrlRecord は同時に削除する', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.deleteTabGroup({
        tabGroupId: 'group-example' as never,
      })
      // url-shared は project-research からの参照で残る
      expect(result.removedUrlRecordIds).toStrictEqual(['url-example-only'])
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id).toSorted()).toStrictEqual(
        ['url-other-1', 'url-shared'].toSorted(),
      )
    })

    it('snapshot には実際に削除された UrlRecord のみを含む（他参照で残ったものは含まない）', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.deleteTabGroup({
        tabGroupId: 'group-example' as never,
      })
      const savedTabs = result.snapshot.savedTabs ?? []
      const urlRecords = result.snapshot.urlRecords ?? []
      expect(savedTabs).toHaveLength(1)
      expect(savedTabs[0]?.id).toBe('group-example')
      // url-shared は CustomProject 側に残るので snapshot には含まれない
      expect(urlRecords.map((record) => record.id)).toStrictEqual([
        'url-example-only',
      ])
    })
  })

  describe('Restore / Undo', () => {
    it('URL open 後の削除 snapshot から TabGroup と UrlRecord を復元できる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const opened = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(opened.snapshot).not.toBeNull()
      const snapshot = opened.snapshot
      if (!snapshot) {
        return
      }

      // restore 前: example-only は storage から消えている
      let urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).not.toContain(
        'url-example-only',
      )

      const restored = await bundle.useCases.restoreOpenedUrlsSnapshot({
        snapshot,
      })
      // snapshot には開いた時点の全 TabGroup が入っているので 2 件返る
      expect(restored.restoredTabGroups).toHaveLength(2)
      expect(restored.restoredTabGroups.map((group) => group.id)).toContain(
        'group-example',
      )
      expect(restored.restoredUrlRecords.map((record) => record.id)).toContain(
        'url-example-only',
      )

      // restore 後: storage にも entity として戻る
      urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).toContain(
        'url-example-only',
      )
    })

    it('TabGroup 削除 snapshot から CustomProject 参照も復元できる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const deleted = await bundle.useCases.deleteTabGroup({
        tabGroupId: 'group-example' as never,
      })
      const snapshot = deleted.snapshot

      // restore 前: group-example は storage から消えている
      let tabGroups = await bundle.deps.tabGroupRepository.findAll()
      expect(tabGroups.map((group) => group.id)).not.toContain('group-example')

      const restored = await bundle.useCases.restoreOpenedUrlsSnapshot({
        snapshot,
      })
      expect(restored.restoredTabGroups.map((group) => group.id)).toContain(
        'group-example',
      )
      // url-shared は CustomProject 側に残っていたので restore の戻り値には
      // 含まれない（既存 project 側に居続ける）
      expect(restored.restoredUrlRecords.map((record) => record.id)).toContain(
        'url-example-only',
      )

      // restore 後: storage に group-example が戻り、url-example-only も復活
      tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const restoredGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(restoredGroup?.memberships.map(({ urlId }) => urlId)).toContain(
        'url-example-only',
      )
      // url-shared は CustomProject 側に居続けるので project-research の urlIds はそのまま
      const customProjects = await bundle.deps.customProjectRepository.findAll()
      expect(
        customProjects[0]?.memberships.map(({ urlId }) => urlId),
      ).toContain('url-shared')
    })
  })

  describe('Category / Search', () => {
    it('バルク同期で parentCategoryId が無い TabGroup を domainName で割り当てる', async () => {
      // parentCategoryId を持たない TabGroup を用意して同期で割り当てる
      const state = buildLegacyFixture()
      const savedTabs = state[SAVED_TABS_KEY] as Record<string, unknown>[]
      const groupExample = savedTabs.find(
        (entry) => entry.id === 'group-example',
      )
      if (groupExample) {
        delete groupExample.parentCategoryId
      }
      const bundle = createBundle(state)
      const result = await bundle.useCases.syncCategoryAssignments({})
      expect(result.assignedTabGroupIds).toContain('group-example')
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup?.collection.groupId).toBe('cat-docs')
    })

    it('単一ドメイン同期で該当 TabGroup を別 ParentCategory へ移動できる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const result = await bundle.useCases.syncCategoryAssignments({
        command: {
          domain: 'other.com' as never,
          parentCategoryId: 'cat-docs' as never,
        },
      })
      expect(result.assignedTabGroupIds).toContain('group-other')
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const otherGroup = tabGroups.find((group) => group.id === 'group-other')
      expect(otherGroup?.collection.groupId).toBe('cat-docs')
    })

    it('未分類の TabGroup は parentCategoryId が外れる', async () => {
      const state = buildLegacyFixture()
      // cat-docs の domainNames / domains を空にしてどの TabGroup も
      // 該当しない状態にしたうえで、group-example の parentCategoryId を
      // 存在しない id に強制する。解決時にどの lookup にもヒットしないので
      // parentCategoryId が外れる（カテゴリ不一致 = 未分類）
      const parentCategories = state[PARENT_CATEGORIES_KEY] as Record<
        string,
        unknown
      >[]
      const docsCategory = parentCategories.find(
        (category) => category.id === 'cat-docs',
      )
      if (docsCategory) {
        docsCategory.domainNames = []
        docsCategory.domains = []
      }
      const savedTabs = state[SAVED_TABS_KEY] as Record<string, unknown>[]
      const groupExample = savedTabs.find(
        (entry) => entry.id === 'group-example',
      )
      if (groupExample) {
        groupExample.parentCategoryId = 'cat-stale'
      }
      const bundle = createBundle(state)
      const result = await bundle.useCases.syncCategoryAssignments({})
      expect(result.unassignedTabGroupIds).toContain('group-example')
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup?.collection.groupId).toBeUndefined()
    })

    it('検索フィルタは旧挙動（URL / title / domain / category）を維持する', async () => {
      const bundle = createBundle(buildLegacyFixture())
      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      const parentCategories =
        await bundle.deps.parentCategoryRepository.findAll()

      // URL 一致
      const urlHit = searchSavedTabs({
        categories: parentCategories,
        contexts: tabGroups.map((group) => ({
          group,
          urls: urlRecords.filter((record) =>
            group.memberships.some(({ urlId }) => urlId === record.id),
          ),
        })),
        input: { query: 'shared' },
      })
      expect(urlHit).toHaveLength(1)
      expect(urlHit[0]?.urls.map((url) => url.id)).toContain('url-shared')

      // title 一致
      const titleHit = searchSavedTabs({
        categories: parentCategories,
        contexts: tabGroups.map((group) => ({
          group,
          urls: urlRecords.filter((record) =>
            group.memberships.some(({ urlId }) => urlId === record.id),
          ),
        })),
        input: { query: 'Only' },
      })
      expect(titleHit).toHaveLength(1)
      expect(titleHit[0]?.urls.map((url) => url.id)).toContain(
        'url-example-only',
      )

      // domain 一致
      const domainHit = searchSavedTabs({
        categories: parentCategories,
        contexts: tabGroups.map((group) => ({
          group,
          urls: urlRecords.filter((record) =>
            group.memberships.some(({ urlId }) => urlId === record.id),
          ),
        })),
        input: { query: 'other' },
      })
      expect(domainHit).toHaveLength(1)
      expect(domainHit[0]?.urls.map((url) => url.id)).toContain('url-other-1')

      // category 一致（カテゴリ名で group 全体がヒット）
      const categoryHit = searchSavedTabs({
        categories: parentCategories,
        contexts: tabGroups.map((group) => ({
          group,
          urls: urlRecords.filter((record) =>
            group.memberships.some(({ urlId }) => urlId === record.id),
          ),
        })),
        input: { query: 'Docs' },
      })
      expect(categoryHit).toHaveLength(1)
      expect(categoryHit[0]?.categoryMatched).toBe(true)
      expect(categoryHit[0]?.urls.map((url) => url.id)).toContain('url-shared')
      expect(categoryHit[0]?.urls.map((url) => url.id)).toContain(
        'url-example-only',
      )

      // どの URL にも一致しない query
      const noHit = searchSavedTabs({
        categories: parentCategories,
        contexts: tabGroups.map((group) => ({
          group,
          urls: urlRecords.filter((record) =>
            group.memberships.some(({ urlId }) => urlId === record.id),
          ),
        })),
        input: { query: 'no-such-needle-zzz' },
      })
      expect(noHit).toHaveLength(0)
    })
  })

  describe('Round-trip (write → reload で永続化が壊れていないか)', () => {
    it('use-case 実行後の storage が新形式として再パースできる', async () => {
      const bundle = createBundle(buildLegacyFixture())
      await bundle.useCases.deleteTabGroup({
        tabGroupId: 'group-example' as never,
      })
      await bundle.useCases.syncCategoryAssignments({})

      // 新しい repository インスタンスで再読み込みしても整合する
      const freshPort = createPort(bundle.portState)
      const freshDeps: SavedTabsUseCasesDeps = {
        ...bundle.deps,
        customProjectRepository: createChromeCustomProjectRepository(freshPort),
        parentCategoryRepository:
          createChromeParentCategoryRepository(freshPort),
        tabGroupRepository: createChromeTabGroupRepository(freshPort),
        urlRecordRepository: createChromeUrlRecordRepository(freshPort),
      }
      const tabGroups = await freshDeps.tabGroupRepository.findAll()
      const urlRecords = await freshDeps.urlRecordRepository.findAll()
      const parentCategories =
        await freshDeps.parentCategoryRepository.findAll()
      const customProjects = await freshDeps.customProjectRepository.findAll()

      expect(tabGroups.map((group) => group.id)).toStrictEqual(['group-other'])
      expect(urlRecords.map((record) => record.id)).toContain('url-shared')
      expect(urlRecords.map((record) => record.id)).toContain('url-other-1')
      expect(parentCategories).toHaveLength(2)
      expect(customProjects).toHaveLength(1)

      // rich な補助フィールドが writeback で消えていないこと
      // domain フィールドは schemeful 形式（`https://other.com`）のまま
      // 保持される（issue #501 review P1 修正: 既存ユーザーの storage
      // 形式と互換にして重複グループ生成を防ぐ）
      const savedTabsRaw = bundle.portState[SAVED_TABS_KEY] as Record<
        string,
        unknown
      >[]
      const otherRaw = savedTabsRaw.find((entry) => entry.id === 'group-other')
      expect(otherRaw).toMatchObject({
        domain: 'https://other.com',
        id: 'group-other',
      })
    })

    it('repository の writeback は entity → raw への写像で必須欠けを起こさない', async () => {
      const bundle = createBundle(buildLegacyFixture())
      // 書き戻しを強制するために同期を呼ぶ
      await bundle.useCases.syncCategoryAssignments({})
      const savedUrlsRaw = bundle.portState[URLS_KEY] as Record<
        string,
        unknown
      >[]
      for (const raw of savedUrlsRaw) {
        expect(raw.id).toBeTypeOf('string')
        expect(raw.savedAt).toBeTypeOf('number')
        expect(raw.title).toBeTypeOf('string')
        expect(raw.url).toBeTypeOf('string')
      }
    })
  })

  describe('Snapshot / Undo 経由でも全エンティティが整合する', () => {
    it('open → restore を繰り返しても entity の urlIds / parentCategoryId が壊れない', async () => {
      const bundle = createBundle(buildLegacyFixture())

      // 1 回目: open & restore
      const first = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(first.snapshot).not.toBeNull()
      if (first.snapshot) {
        await bundle.useCases.restoreOpenedUrlsSnapshot({
          snapshot: first.snapshot,
        })
      }

      const tabGroups = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup = tabGroups.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup?.memberships.map(({ urlId }) => urlId)).toContain(
        'url-example-only',
      )
      const urlRecords = await bundle.deps.urlRecordRepository.findAll()
      expect(urlRecords.map((record) => record.id)).toContain(
        'url-example-only',
      )

      // 2 回目: open & restore
      const second = await bundle.useCases.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: 'url-example-only' as never,
      })
      expect(second.snapshot).not.toBeNull()
      if (second.snapshot) {
        await bundle.useCases.restoreOpenedUrlsSnapshot({
          snapshot: second.snapshot,
        })
      }
      const tabGroups2 = await bundle.deps.tabGroupRepository.findAll()
      const exampleGroup2 = tabGroups2.find(
        (group) => group.id === 'group-example',
      )
      expect(exampleGroup2?.memberships.map(({ urlId }) => urlId)).toContain(
        'url-example-only',
      )
    })
  })
})

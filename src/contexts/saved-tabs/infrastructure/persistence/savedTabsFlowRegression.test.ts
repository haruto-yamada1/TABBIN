import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { searchSavedTabs } from '@/contexts/saved-tabs/domain/services/SavedTabsSearchService'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import {
  createCustomProject,
  createTabGroup as createGroupFixture,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { IndexedDbConnectionManager } from './indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './indexed-db/IndexedDbPersistenceUnitOfWork'

const gate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
}
const managers: IndexedDbConnectionManager[] = []
const urls = [
  {
    id: 'url-shared',
    url: 'https://example.com/shared',
    title: 'Shared Research',
    savedAt: 1,
  },
  {
    id: 'url-example-only',
    url: 'https://example.com/only',
    title: 'Example Only',
    savedAt: 1,
  },
  {
    id: 'url-other',
    url: 'https://other.com/news',
    title: 'Other News',
    savedAt: 1,
  },
]

const createBundle = async () => {
  const indexedDb = new IDBFactory()
  const databaseName = 'saved-tabs-native-flow'
  const manager = new IndexedDbConnectionManager({ indexedDb, databaseName })
  managers.push(manager)
  const settingsGet = vi.fn(async (key: string) => {
    if (key !== 'userSettings') {
      throw new Error('Domain data must not read Chrome Storage')
    }
    return { userSettings: { enableCategories: true } }
  })
  const settingsSet = vi.fn()
  const open = vi.fn(async ({ url }: { url: string }) => ({ url }))
  const openWindow = vi.fn(async ({ url }: { url: readonly string[] }) => ({
    tabs: url.map((entry) => ({ url: entry })),
  }))
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: settingsGet, set: settingsSet },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { create: open },
    windows: { create: openWindow },
  })
  const example = createGroupFixture({
    id: 'group-example',
    domain: 'example.com',
    parentCategoryId: 'cat-docs',
    savedAt: 1,
    subCategories: ['docs', 'review'],
    categoryKeywords: [{ categoryName: 'docs', keywords: ['Research'] }],
    memberships: [
      { urlId: 'url-shared', category: 'docs' },
      { urlId: 'url-example-only', category: 'review' },
    ],
  })
  const other = createGroupFixture({
    id: 'group-other',
    domain: 'other.com',
    savedAt: 1,
    parentCategoryId: 'cat-news',
    memberships: [{ urlId: 'url-other' }],
  })
  const project = createCustomProject({
    id: 'project-research',
    name: 'Research',
    categories: ['research'],
    createdAt: 1,
    memberships: [
      { urlId: 'url-shared', category: 'research', notes: 'shared note' },
    ],
  })
  await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
    collections: {
      put: [example.collection, other.collection, project.collection],
    },
    categories: {
      put: [...example.collectionCategories, ...project.collectionCategories],
    },
    memberships: {
      put: [
        ...example.memberships,
        ...other.memberships,
        ...project.memberships,
      ],
    },
    groups: {
      put: [
        {
          id: 'cat-docs',
          name: 'Docs',
          createdAt: 1,
          updatedAt: 1,
          sortOrder: 0,
        },
        {
          id: 'cat-news',
          name: 'News',
          createdAt: 1,
          updatedAt: 1,
          sortOrder: 1,
        },
      ],
    },
    urls: {
      put: urls.map(({ savedAt, ...url }) => ({
        ...url,
        normalizedUrl: url.url,
        firstSavedAt: savedAt,
        firstSavedAtProvenance: 'exact',
        lastSavedAt: savedAt,
        lastSavedAtProvenance: 'exact',
        updatedAt: savedAt,
      })),
    },
  })
  let active = true
  const options = {
    connectionManager: manager,
    operationGate: gate,
    presentationOptions: { resolveActive: () => active },
  }
  const useCases = createIndexedDbSavedTabsUseCases(options)
  const read = async () =>
    new IndexedDbPersistenceSnapshotReader(
      manager,
      gate,
    ).readVerifiedSavedTabsSnapshot()
  const reload = () => {
    manager.close()
    const next = new IndexedDbConnectionManager({ indexedDb, databaseName })
    managers.push(next)
    return {
      useCases: createIndexedDbSavedTabsUseCases({
        ...options,
        connectionManager: next,
      }),
      read: async () =>
        new IndexedDbPersistenceSnapshotReader(
          next,
          gate,
        ).readVerifiedSavedTabsSnapshot(),
    }
  }
  return {
    manager,
    useCases,
    read,
    reload,
    open,
    openWindow,
    settingsGet,
    settingsSet,
    setActive: (value: boolean) => {
      active = value
    },
  }
}

const openCommand = (removeTabAfterOpen = false) => ({
  origin: 'click' as const,
  urlRecordId: 'url-shared',
  settings: { removeTabAfterOpen, removeTabAfterExternalDrop: false },
})

describe('saved-tabs native IndexedDB flow regressions', () => {
  afterEach(() => {
    for (const manager of managers.splice(0)) {
      manager.close()
    }
    vi.unstubAllGlobals()
  })

  it('現在の collection/category/membership を legacy storage なしで読み出す', async () => {
    const bundle = await createBundle()
    const page = await bundle.useCases.getSavedTabsPageData()
    expect(page.tabGroups).toHaveLength(2)
    expect(
      page.tabGroups[0]?.collectionCategories.map(({ name }) => name),
    ).toEqual(['docs', 'review'])
    const projects = await bundle.useCases.getCustomProjects()
    expect(projects[0]?.memberships[0]).toMatchObject({
      urlId: 'url-shared',
      notes: 'shared note',
    })
    expect(
      bundle.settingsGet.mock.calls.every(([key]) => key === 'userSettings'),
    ).toBe(true)
    expect(bundle.settingsSet).not.toHaveBeenCalled()
  })

  it('壊れた IndexedDB domain record は silent skip せず fail closed する', async () => {
    const bundle = await createBundle()
    const db = await bundle.manager.open()
    const transaction = db.transaction('urls', 'readwrite')
    transaction.objectStore('urls').put({ id: 'broken-url' })
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener(
        'error',
        () =>
          reject(
            transaction.error ?? new Error('IndexedDB fixture write failed'),
          ),
        { once: true },
      )
    })
    await expect(bundle.read()).rejects.toThrow(/url/i)
    expect(
      bundle.settingsGet.mock.calls.every(([key]) => key === 'userSettings'),
    ).toBe(true)
  })

  it('URL を browser port で開く', async () => {
    const bundle = await createBundle()
    const result = await bundle.useCases.openSavedUrl(openCommand())
    expect(result.openedUrl).toBe(urls[0]?.url)
    expect(bundle.open).toHaveBeenCalledWith({
      url: urls[0]?.url,
      active: true,
    })
  })

  it('background preference の更新を resolveActive 経由で反映する', async () => {
    const bundle = await createBundle()
    bundle.setActive(false)
    await bundle.useCases.openSavedUrl(openCommand())
    expect(bundle.open).toHaveBeenLastCalledWith({
      url: urls[0]?.url,
      active: false,
    })
    bundle.setActive(true)
    await bundle.useCases.openSavedUrl(openCommand())
    expect(bundle.open).toHaveBeenLastCalledWith({
      url: urls[0]?.url,
      active: true,
    })
  })

  it('removeTabAfterOpen=false は revision と永続データを変更しない', async () => {
    const bundle = await createBundle()
    const before = await bundle.read()
    const result = await bundle.useCases.openSavedUrl(openCommand())
    expect(result.snapshot).toBeNull()
    expect(await bundle.read()).toEqual(before)
  })

  it('removeTabAfterOpen=true は domain/custom 両参照と孤立 URL を同一 mutation で削除する', async () => {
    const bundle = await createBundle()
    const result = await bundle.useCases.openSavedUrl(openCommand(true))
    expect(result.removedUrlRecordId).toBe('url-shared')
    const after = await bundle.reload().read()
    expect(after.savedTabs.urls.map(({ id }) => id)).not.toContain('url-shared')
    expect(after.savedTabs.memberships.map(({ urlId }) => urlId)).not.toContain(
      'url-shared',
    )
    expect(checkPersistenceIntegrity(after.savedTabs)).toMatchObject({
      isHealthy: true,
    })
  })

  it('単一 domain group の削除は custom が参照する URL を保持する', async () => {
    const bundle = await createBundle()
    const result = await bundle.useCases.deleteTabGroup({
      tabGroupId: 'group-example',
    })
    expect(result.removedTabGroupId).toBe('group-example')
    expect(result.removedUrlRecordIds).toEqual(['url-example-only'])
    const after = await bundle.reload().read()
    expect(after.savedTabs.collections.map(({ id }) => id)).not.toContain(
      'group-example',
    )
    expect(after.savedTabs.urls.map(({ id }) => id)).toContain('url-shared')
    expect(after.savedTabs.memberships).toContainEqual(
      expect.objectContaining({
        collectionId: 'project-research',
        urlId: 'url-shared',
      }),
    )
  })

  it('削除 snapshot は実際に消した URL のみ含む', async () => {
    const bundle = await createBundle()
    const result = await bundle.useCases.deleteTabGroup({
      tabGroupId: 'group-example',
    })
    expect(result.snapshot.urlRecords?.map(({ id }) => id)).toEqual([
      'url-example-only',
    ])
    expect(result.snapshot.savedTabs?.[0]?.id).toBe('group-example')
  })

  it('open 後の Undo は domain/custom 参照・notes・category を復元する', async () => {
    const bundle = await createBundle()
    const before = await bundle.read()
    const result = await bundle.useCases.openSavedUrl(openCommand(true))
    expect(result.snapshot).not.toBeNull()
    if (!result.snapshot) {
      throw new Error('Expected Undo snapshot')
    }
    await bundle.useCases.restoreOpenedUrlsSnapshot({
      snapshot: result.snapshot,
    })
    const after = await bundle.reload().read()
    expect(after.savedTabs).toEqual(before.savedTabs)
    expect(checkPersistenceIntegrity(after.savedTabs).isHealthy).toBe(true)
  })

  it('group 削除の Undo は共有 URL を重複させず domain category を復元する', async () => {
    const bundle = await createBundle()
    const before = await bundle.read()
    const result = await bundle.useCases.deleteTabGroup({
      tabGroupId: 'group-example',
    })
    await bundle.useCases.restoreOpenedUrlsSnapshot({
      snapshot: result.snapshot,
    })
    const after = await bundle.reload().read()
    expect(after.savedTabs).toEqual(before.savedTabs)
    expect(
      after.savedTabs.urls.filter(({ id }) => id === 'url-shared'),
    ).toHaveLength(1)
  })

  it('open / restore の繰り返しでも参照と親カテゴリは壊れない', async () => {
    const bundle = await createBundle()
    const before = await bundle.read()
    const openAndRestore = async () => {
      const result = await bundle.useCases.openSavedUrl(openCommand(true))
      if (!result.snapshot) {
        throw new Error('Expected Undo snapshot')
      }
      await bundle.useCases.restoreOpenedUrlsSnapshot({
        snapshot: result.snapshot,
      })
    }
    await openAndRestore()
    await openAndRestore()
    await openAndRestore()
    expect((await bundle.reload().read()).savedTabs).toEqual(before.savedTabs)
  })

  it('カテゴリ移動と未分類への変更を再起動後も保持する', async () => {
    const bundle = await createBundle()
    await bundle.useCases.assignDomainToCategory({
      domainId: 'group-example',
      categoryId: 'cat-news',
    })
    expect(
      (await bundle.read()).savedTabs.collections.find(
        ({ id }) => id === 'group-example',
      )?.groupId,
    ).toBe('cat-news')
    await bundle.useCases.assignDomainToCategory({
      domainId: 'group-example',
      categoryId: 'none',
    })
    expect(
      (await bundle.reload().read()).savedTabs.collections.find(
        ({ id }) => id === 'group-example',
      )?.groupId,
    ).toBeUndefined()
  })

  it('URL 並び替えを再読込しても子カテゴリと notes を保持する', async () => {
    const bundle = await createBundle()
    await bundle.useCases.reorderTabGroupUrls({
      tabGroupId: 'group-example',
      newUrlOrder: ['https://example.com/only', 'https://example.com/shared'],
    })
    const after = await bundle.reload().useCases.getSavedTabsPageData()
    const group = after.tabGroups.find(({ id }) => id === 'group-example')
    expect(group?.memberships.map(({ urlId }) => urlId)).toEqual([
      'url-example-only',
      'url-shared',
    ])
    expect(
      group?.memberships.every(({ categoryId }) => categoryId !== undefined),
    ).toBe(true)
  })

  it('project 順序保存は再起動後も維持される', async () => {
    const bundle = await createBundle()
    const created = await bundle.useCases.createCustomProject({
      name: 'Second',
    })
    await bundle.useCases.saveCustomProjectOrder({
      newOrder: [created.project.id, 'project-research'],
    })
    expect(await bundle.reload().useCases.getCustomProjectOrder()).toEqual([
      created.project.id,
      'project-research',
    ])
  })

  it.each(['shared', 'research', 'example.com', 'docs'])(
    '検索は URL/title/domain/category の意味を維持する: %s',
    async (query) => {
      const bundle = await createBundle()
      const page = await bundle.useCases.getSavedTabsPageData()
      const group = page.tabGroups.find(({ id }) => id === 'group-example')
      if (!group) {
        throw new Error('Expected group')
      }
      const result = searchSavedTabs({
        input: { query },
        contexts: [
          {
            group: createTabGroup(group),
            urls: (group.resolvedUrls ?? []).map((url) => {
              if (url.id === undefined) {
                throw new Error('Expected persisted URL ID')
              }
              return createUrlRecord({
                ...url,
                id: url.id,
                savedAt: url.savedAt ?? 0,
              })
            }),
          },
        ],
        categories: page.parentCategories.map(createParentCategory),
      })
      expect(result).toHaveLength(1)
      expect(result[0]?.urls).toHaveLength(
        query === 'docs' || query === 'example.com' ? 2 : 1,
      )
    },
  )

  it('all open は newWindow 設定でまとめて開く', async () => {
    const bundle = await createBundle()
    await bundle.useCases.openAllSavedUrls({
      mode: 'newWindow',
      removeTabAfterOpen: false,
      urls: urls.map(({ url }) => url),
    })
    expect(bundle.openWindow).toHaveBeenCalledWith({
      focused: true,
      url: urls.map(({ url }) => url),
    })
    expect(bundle.open).not.toHaveBeenCalled()
    expect((await bundle.reload().read()).savedTabs.urls).toHaveLength(3)
  })
})

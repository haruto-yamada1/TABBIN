import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBackgroundSavedTabsIndexedDbDataPlane } from '@/app/composition/backgroundSavedTabsIndexedDbDataPlane'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from './createIndexedDbSavedTabsUseCases'

const gate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  runLegacyRead: async (operation) => operation(),
  runLegacyWrite: async (operation) => operation(),
}

describe('createIndexedDbSavedTabsUseCases', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads and writes the production bundle through IndexedDB only', async () => {
    const storageGet = vi.fn(async (key: unknown) =>
      key === 'userSettings' ? {} : {},
    )
    const storageSet = vi.fn()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: storageGet,
          remove: vi.fn(),
          set: storageSet,
        },
      },
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-production-bundle-test',
      indexedDb: new IDBFactory(),
    })
    await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: { domain: 'example.com', type: 'domain' },
            id: 'domain-example',
            name: 'example.com',
            sortOrder: 0,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'domain-example',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'url-1',
          },
        ],
      },
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'url-1',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/',
            title: 'Example',
            updatedAt: 1,
            url: 'https://example.com/',
          },
        ],
      },
    })
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })

    const page = await useCases.getSavedTabsPageData()
    expect(page.tabGroups).toEqual([
      expect.objectContaining({
        collection: expect.objectContaining({
          definition: { domain: 'example.com', type: 'domain' },
        }),
        resolvedUrls: [expect.objectContaining({ id: 'url-1' })],
      }),
    ])
    expect(storageGet).toHaveBeenCalledWith('userSettings')
    expect(storageGet).not.toHaveBeenCalledWith('savedTabs')

    await useCases.createCustomProject({ name: 'Research' })
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      gate,
    ).readVerifiedSavedTabsSnapshot()
    expect(
      snapshot.savedTabs.collections.some(
        ({ definition }) => definition.type === 'custom',
      ),
    ).toBe(true)
    expect(snapshot.revision).toBe(2)
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('ドメインの並び替えを保存後に再読込してもカテゴリ内の順序を維持する', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
    })
    const databaseName = 'saved-tabs-domain-reorder-reload-test'
    const indexedDb = new IDBFactory()
    const manager = new IndexedDbConnectionManager({
      databaseName,
      indexedDb,
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)
    await unitOfWork.commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: { domain: 'first.example', type: 'domain' },
            groupId: 'group-docs',
            id: 'domain-first',
            name: 'first.example',
            sortOrder: 0,
            updatedAt: 1,
          },
          {
            createdAt: 1,
            definition: { domain: 'second.example', type: 'domain' },
            groupId: 'group-docs',
            id: 'domain-second',
            name: 'second.example',
            sortOrder: 1,
            updatedAt: 1,
          },
        ],
      },
      groups: {
        put: [
          {
            createdAt: 1,
            id: 'group-docs',
            name: 'Docs',
            sortOrder: 0,
            updatedAt: 1,
          },
        ],
      },
    })

    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })
    const before = await useCases.getSavedTabsPageData()
    expect(before.parentCategories[0]?.collections.map(({ id }) => id)).toEqual(
      ['domain-first', 'domain-second'],
    )

    await useCases.reorderDomainsInCategory({
      categoryId: 'group-docs',
      updatedDomains: before.tabGroups.toReversed(),
    })

    manager.close()
    const reloadedManager = new IndexedDbConnectionManager({
      databaseName,
      indexedDb,
    })
    const reloadedUseCases = createIndexedDbSavedTabsUseCases({
      connectionManager: reloadedManager,
    })
    const after = await reloadedUseCases.getSavedTabsPageData()

    expect(after.parentCategories[0]?.collections.map(({ id }) => id)).toEqual([
      'domain-second',
      'domain-first',
    ])
  })

  it('カテゴリキーワード保存時に対象collectionの既存membershipをordered categoryへ再分類する', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-category-keyword-reclassification-test',
      indexedDb: new IDBFactory(),
    })
    const matchingMembership = {
      addedAt: 1,
      addedAtProvenance: 'exact' as const,
      collectionId: 'domain-example',
      notes: 'matching keep',
      sortOrder: 0,
      updatedAt: 1,
      urlId: 'url-members',
    }
    const unmatchedMembership = {
      addedAt: 3,
      addedAtProvenance: 'exact' as const,
      categoryId: 'category-existing',
      collectionId: 'domain-example',
      notes: 'keep',
      sortOrder: 2,
      updatedAt: 3,
      urlId: 'url-unmatched',
    }
    const alreadyCategorizedMembership = {
      addedAt: 4,
      categoryId: 'category-members',
      collectionId: 'domain-example',
      sortOrder: 3,
      updatedAt: 4,
      urlId: 'url-already-categorized',
    }
    const otherCollectionMembership = {
      addedAt: 5,
      collectionId: 'domain-other',
      notes: 'other',
      sortOrder: 0,
      updatedAt: 5,
      urlId: 'url-other',
    }
    await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
      categories: {
        put: [
          {
            collectionId: 'domain-example',
            createdAt: 1,
            id: 'category-team',
            keywords: ['team', ''],
            name: 'Team',
            sortOrder: 0,
            updatedAt: 1,
          },
          {
            collectionId: 'domain-example',
            createdAt: 1,
            id: 'category-members',
            keywords: [],
            name: 'Members',
            sortOrder: 1,
            updatedAt: 1,
          },
          {
            collectionId: 'domain-example',
            createdAt: 1,
            id: 'category-existing',
            keywords: [],
            name: 'Existing',
            sortOrder: 2,
            updatedAt: 1,
          },
        ],
      },
      collections: {
        put: [
          {
            createdAt: 1,
            definition: { domain: 'example.com', type: 'domain' },
            id: 'domain-example',
            name: 'example.com',
            sortOrder: 0,
            updatedAt: 1,
          },
          {
            createdAt: 1,
            definition: { domain: 'other.example', type: 'domain' },
            id: 'domain-other',
            name: 'other.example',
            sortOrder: 1,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          matchingMembership,
          {
            addedAt: 2,
            collectionId: 'domain-example',
            sortOrder: 1,
            updatedAt: 2,
            urlId: 'url-overlap',
          },
          unmatchedMembership,
          alreadyCategorizedMembership,
          otherCollectionMembership,
        ],
      },
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'url-members',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/members',
            title: 'MEMBER handbook',
            updatedAt: 1,
            url: 'https://example.com/members',
          },
          {
            firstSavedAt: 1,
            id: 'url-overlap',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/team-member',
            title: 'Team Member dashboard',
            updatedAt: 1,
            url: 'https://example.com/team-member',
          },
          {
            firstSavedAt: 1,
            id: 'url-unmatched',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/unmatched',
            title: 'Unrelated article',
            updatedAt: 1,
            url: 'https://example.com/unmatched',
          },
          {
            firstSavedAt: 1,
            id: 'url-already-categorized',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/already-categorized',
            title: 'Existing member profile',
            updatedAt: 1,
            url: 'https://example.com/already-categorized',
          },
          {
            firstSavedAt: 1,
            id: 'url-other',
            lastSavedAt: 1,
            normalizedUrl: 'https://other.example/member',
            title: 'Member in another collection',
            updatedAt: 1,
            url: 'https://other.example/member',
          },
        ],
      },
    })
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })

    await useCases.setCategoryKeywords({
      categoryName: 'Members',
      keywords: ['member'],
      tabGroupId: 'domain-example',
    })

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      gate,
    ).readVerifiedSavedTabsSnapshot()
    const membershipByUrlId = new Map(
      snapshot.savedTabs.memberships.map((membership) => [
        membership.urlId,
        membership,
      ]),
    )
    expect(
      snapshot.savedTabs.categories.find(({ id }) => id === 'category-members'),
    ).toMatchObject({
      id: 'category-members',
      keywords: ['member'],
    })
    expect(membershipByUrlId.get('url-members')).toMatchObject({
      ...matchingMembership,
      categoryId: 'category-members',
      updatedAt: expect.any(Number),
    })
    expect(membershipByUrlId.get('url-members')?.updatedAt).toBeGreaterThan(1)
    expect(membershipByUrlId.get('url-overlap')).toMatchObject({
      categoryId: 'category-team',
    })
    expect(membershipByUrlId.get('url-unmatched')).toStrictEqual(
      unmatchedMembership,
    )
    expect(membershipByUrlId.get('url-already-categorized')).toStrictEqual(
      alreadyCategorizedMembership,
    )
    expect(membershipByUrlId.get('url-other')).toStrictEqual(
      otherCollectionMembership,
    )
    expect(snapshot.revision).toBe(2)
  })

  it('propagates an IndexedDB open failure without reading or writing legacy saved-tabs storage', async () => {
    const storageGet = vi.fn(async () => ({}))
    const storageSet = vi.fn()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: storageGet,
          remove: vi.fn(),
          set: storageSet,
        },
      },
    })
    const indexedDb = new IDBFactory()
    const error = new Error('indexeddb unavailable')
    vi.spyOn(indexedDb, 'open').mockImplementation(() => {
      throw error
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-production-bundle-failure-test',
      indexedDb,
    })
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })

    await expect(useCases.getSavedTabs()).rejects.toMatchObject({
      code: 'OPEN_FAILED',
      message: 'IndexedDB connection open failed.',
    })
    expect(storageGet).not.toHaveBeenCalledWith('savedTabs')
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('unrelated custom-project and expiry removals preserve a pre-existing legacy orphan', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-targeted-orphan-cleanup-test',
      indexedDb: new IDBFactory(),
    })
    await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: {
              projectKeywords: {
                domainKeywords: [],
                titleKeywords: [],
                urlKeywords: [],
              },
              type: 'custom',
            },
            id: 'project',
            name: 'Project',
            sortOrder: 0,
            updatedAt: 1,
          },
          {
            createdAt: 1,
            definition: { domain: 'expired.example', type: 'domain' },
            id: 'expired-domain',
            name: 'expired.example',
            sortOrder: 1,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'project',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'selected-url',
          },
          {
            addedAt: 1,
            collectionId: 'expired-domain',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'expired-url',
          },
        ],
      },
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'legacy-orphan',
            lastSavedAt: 1,
            normalizedUrl: 'https://orphan.example/',
            title: 'Legacy orphan',
            updatedAt: 1,
            url: 'https://orphan.example/',
          },
          {
            firstSavedAt: 1,
            id: 'selected-url',
            lastSavedAt: 1,
            normalizedUrl: 'https://selected.example/',
            title: 'Selected URL',
            updatedAt: 1,
            url: 'https://selected.example/',
          },
          {
            firstSavedAt: 1,
            id: 'expired-url',
            lastSavedAt: 1,
            normalizedUrl: 'https://expired.example/',
            title: 'Expired URL',
            updatedAt: 1,
            url: 'https://expired.example/',
          },
        ],
      },
    })
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })

    await useCases.removeUrlFromCustomProject({
      projectId: 'project',
      url: 'https://selected.example/',
    })

    const afterProjectRemoval =
      await snapshotReader.readVerifiedSavedTabsSnapshot()
    expect(afterProjectRemoval.savedTabs.urls.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['legacy-orphan', 'expired-url']),
    )
    expect(afterProjectRemoval.savedTabs.urls).toHaveLength(2)

    const runtime = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: manager,
    })
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => 'unused',
      now: () => 3,
      readSnapshot: async () => snapshotReader.readVerifiedSavedTabsSnapshot(),
      session: runtime.session,
    })
    await dataPlane.removeExpiredUrls(2, 3)

    const afterExpiryRemoval =
      await snapshotReader.readVerifiedSavedTabsSnapshot()
    expect(afterExpiryRemoval.savedTabs.urls.map(({ id }) => id)).toStrictEqual(
      ['legacy-orphan'],
    )
    expect(afterExpiryRemoval.savedTabs.memberships).toStrictEqual([])
  })

  it('legacy 共有 URL を開いて再保存した後も reload 用 snapshot を健全に保つ', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(async ({ url }: { readonly url: string }) => ({ url })),
      },
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-legacy-open-resave-reload-test',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)
    await unitOfWork.commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: { domain: 'example.com', type: 'domain' },
            id: 'legacy-domain',
            name: 'example.com',
            sortOrder: 0,
            updatedAt: 1,
          },
          {
            createdAt: 1,
            definition: {
              projectKeywords: {
                domainKeywords: [],
                titleKeywords: [],
                urlKeywords: [],
              },
              type: 'custom',
            },
            id: 'legacy-project',
            name: 'Legacy project',
            sortOrder: 0,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'legacy-domain',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'legacy-url',
          },
          {
            addedAt: 1,
            collectionId: 'legacy-project',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'legacy-url',
          },
        ],
      },
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'legacy-url',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/',
            title: 'Legacy URL',
            updatedAt: 1,
            url: 'https://example.com/',
          },
        ],
      },
    })
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
    })

    await useCases.openSavedUrl({
      origin: 'click',
      settings: {
        removeTabAfterExternalDrop: false,
        removeTabAfterOpen: true,
      },
      urlRecordId: 'legacy-url' as never,
    })

    const runtime = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: manager,
    })
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => 'resaved-url',
      now: () => 2,
      readSnapshot: async () => snapshotReader.readVerifiedSavedTabsSnapshot(),
      session: runtime.session,
    })
    await dataPlane.saveTabs([
      { title: 'Legacy URL resaved', url: 'https://example.com/' },
    ])

    const reloaded = await snapshotReader.readVerifiedSavedTabsSnapshot()
    expect(reloaded.savedTabs.urls).toEqual([
      expect.objectContaining({
        id: 'resaved-url',
        normalizedUrl: 'https://example.com/',
      }),
    ])
    expect(reloaded.savedTabs.memberships).toHaveLength(2)
  })

  it('warning-only orphan URL を再保存すると既存 ID と firstSavedAt を保持する', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
    })
    const manager = new IndexedDbConnectionManager({
      databaseName: 'saved-tabs-orphan-resave-test',
      indexedDb: new IDBFactory(),
    })
    await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'legacy-orphan',
            lastSavedAt: 1,
            normalizedUrl: 'https://orphan.example/',
            title: 'Legacy orphan',
            updatedAt: 1,
            url: 'https://orphan.example/',
          },
        ],
      },
    })
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)
    const runtime = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: manager,
    })
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => 'duplicate-url',
      now: () => 2,
      readSnapshot: async () => snapshotReader.readVerifiedSavedTabsSnapshot(),
      session: runtime.session,
    })

    await dataPlane.saveTabs([
      { title: 'Legacy orphan resaved', url: 'https://orphan.example/' },
    ])

    const reloaded = await snapshotReader.readVerifiedSavedTabsSnapshot()
    expect(reloaded.savedTabs.urls).toEqual([
      expect.objectContaining({
        firstSavedAt: 1,
        id: 'legacy-orphan',
        lastSavedAt: 2,
      }),
    ])
    expect(reloaded.savedTabs.memberships).toHaveLength(2)
  })
})

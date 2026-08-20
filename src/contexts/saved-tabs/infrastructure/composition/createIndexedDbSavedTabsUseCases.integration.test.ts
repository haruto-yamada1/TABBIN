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

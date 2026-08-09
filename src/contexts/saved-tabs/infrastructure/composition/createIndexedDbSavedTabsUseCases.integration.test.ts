import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

import { createIndexedDbSavedTabsUseCases } from './createIndexedDbSavedTabsUseCases'

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
})

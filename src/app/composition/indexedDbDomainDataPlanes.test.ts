import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'

import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'

import {
  getAiConversationHistoryDataPlane,
  resetAiConversationHistoryDataPlaneForTesting,
} from './aiConversationHistoryDataPlane'
import {
  getAnalyticsViewsDataPlane,
  resetAnalyticsViewsDataPlaneForTesting,
} from './analyticsViewsDataPlane'
import {
  getBackgroundSavedTabsDataPlane,
  resetBackgroundSavedTabsDataPlaneForTesting,
} from './backgroundSavedTabsDataPlane'

const mocked = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  getStorage: vi.fn(),
  publish: vi.fn(async () => {}),
}))

vi.mock(
  '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime',
  () => ({ getPersistenceBootstrapRuntime: mocked.getRuntime }),
)
vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageLocal: mocked.getStorage,
}))
vi.mock(
  '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter',
  () => ({
    createBroadcastChannelPersistenceChangeAdapter: () => ({
      publish: mocked.publish,
    }),
  }),
)

const message = { content: 'Preserved', id: 'message-1', role: 'user' }
const conversation = {
  createdAt: 10,
  id: 'conversation-1',
  messages: [message],
  title: 'Existing history',
  updatedAt: 20,
}
const view = { id: 'view-1', name: 'Existing view', updatedAt: 20 }

describe('IndexedDB domain data-plane production composition', () => {
  let connectionManager: IndexedDbConnectionManager
  const reads = vi.fn()
  const writes = vi.fn()
  const operationGate = {
    runIndexedDbRead: async <Result>(
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      reads()
      return operation()
    },
    runIndexedDbWrite: async <Result>(
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      writes()
      return operation()
    },
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    resetAiConversationHistoryDataPlaneForTesting()
    resetAnalyticsViewsDataPlaneForTesting()
    resetBackgroundSavedTabsDataPlaneForTesting()
    connectionManager = new IndexedDbConnectionManager({
      databaseName: 'domain-data-plane-production',
      indexedDb: new IDBFactory(),
    })
    mocked.getRuntime.mockReturnValue({
      connectionManager,
      operationGate,
    })
    await new IndexedDbPersistenceUnitOfWork(
      connectionManager,
      operationGate,
    ).commit({
      analyticsViews: { put: [{ id: view.id, updatedAt: 20, value: view }] },
      conversations: {
        put: [
          {
            id: conversation.id,
            updatedAt: 20,
            value: {
              createdAt: 10,
              messageIds: ['message-1'],
              title: conversation.title,
            },
          },
        ],
      },
      messages: {
        put: [
          {
            conversationId: conversation.id,
            createdAt: 10,
            id: 'message-1',
            value: message,
          },
        ],
      },
    })
    reads.mockClear()
    writes.mockClear()
  })

  afterEach(() => {
    connectionManager.close()
    vi.restoreAllMocks()
  })

  it('keeps existing IndexedDB conversation history and only stores UI selection in Chrome Storage', async () => {
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: conversation.id })),
      set: vi.fn(async () => {}),
    }
    mocked.getStorage.mockReturnValue(storage)
    const dataPlane = getAiConversationHistoryDataPlane()
    assert.isNotNull(dataPlane)

    await expect(dataPlane.read()).resolves.toEqual({
      activeConversationId: conversation.id,
      conversations: [conversation],
    })
    await dataPlane.replace({
      activeConversationId: conversation.id,
      conversations: [conversation],
    })

    expect(storage.get).toHaveBeenCalledExactlyOnceWith(
      'activeAiChatConversationId',
    )
    expect(storage.set).toHaveBeenCalledExactlyOnceWith({
      activeAiChatConversationId: conversation.id,
    })
    expect(reads).toHaveBeenCalledTimes(2)
    expect(writes).not.toHaveBeenCalled()
  })

  it('reads and edits Analytics Views without requiring Chrome Storage or migration state', async () => {
    mocked.getStorage.mockReturnValue(null)
    const dataPlane = getAnalyticsViewsDataPlane()
    assert.isNotNull(dataPlane)

    await expect(dataPlane.readValues()).resolves.toEqual([view])
    const changed = { ...view, name: 'Updated view', updatedAt: 30 }
    await dataPlane.replaceValues([changed])
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ).readConsistentSnapshot()

    expect(snapshot.analyticsViews).toEqual([
      { id: view.id, updatedAt: 30, value: changed },
    ])
    expect(snapshot.conversations).toHaveLength(1)
    expect(mocked.getStorage).not.toHaveBeenCalled()
    expect(writes).toHaveBeenCalledOnce()
  })

  it('keeps IndexedDB conversation history available when selection storage is absent', async () => {
    mocked.getStorage.mockReturnValue(null)
    const dataPlane = getAiConversationHistoryDataPlane()

    await expect(dataPlane.read()).resolves.toEqual({
      activeConversationId: undefined,
      conversations: [conversation],
    })
    await dataPlane.replace({
      activeConversationId: conversation.id,
      conversations: [conversation],
    })

    expect(writes).not.toHaveBeenCalled()
  })

  it('propagates database unavailability without trying Chrome Storage domain data', async () => {
    const storage = {
      get: vi.fn(),
      set: vi.fn(),
    }
    mocked.getStorage.mockReturnValue(storage)
    const failure = new Error('database unavailable')
    vi.spyOn(operationGate, 'runIndexedDbRead').mockRejectedValue(failure)

    await expect(getAnalyticsViewsDataPlane().readValues()).rejects.toBe(
      failure,
    )
    await expect(
      getBackgroundSavedTabsDataPlane().readInsightRecords(),
    ).rejects.toBe(failure)

    expect(storage.get).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('keeps captured URLs and existing metadata intact across database close and worker recreation', async () => {
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const existingUrl = 'https://example.com/existing'
    const freshUrl = 'https://example.com/new'
    await dataPlane.saveTabs([{ title: 'User title', url: existingUrl }])
    const initial = await dataPlane.readUndoSnapshot()
    const existing = initial.savedTabs.urls[0]
    assert.isDefined(existing)
    await new IndexedDbPersistenceUnitOfWork(
      connectionManager,
      operationGate,
    ).commit({
      urls: { put: [{ ...existing, isFavorite: true }] },
      memberships: {
        put: initial.savedTabs.memberships.map((membership) => ({
          ...membership,
          notes: 'Keep my note',
        })),
      },
    })
    const protectedSnapshot = await dataPlane.readUndoSnapshot()
    const links = [
      { title: 'Page replacement must not win', url: existingUrl },
      { title: 'Fresh link', url: freshUrl },
    ]
    await expect(
      dataPlane.saveTabs(links, { preserveExisting: true }),
    ).resolves.toEqual({ existingCount: 1, savedCount: 1 })
    const committed = await dataPlane.readUndoSnapshot()
    expect(
      committed.savedTabs.urls.find(({ id }) => id === existing.id),
    ).toEqual(protectedSnapshot.savedTabs.urls[0])
    expect(
      committed.savedTabs.memberships.filter(
        ({ urlId }) => urlId === existing.id,
      ),
    ).toEqual(protectedSnapshot.savedTabs.memberships)

    connectionManager.close()
    resetBackgroundSavedTabsDataPlaneForTesting()
    const restarted = getBackgroundSavedTabsDataPlane()
    await expect(restarted.readUndoSnapshot()).resolves.toEqual(committed)
    // A lost completion response may cause the same batch to be sent after worker wake.
    await expect(
      restarted.saveTabs(links, { preserveExisting: true }),
    ).resolves.toEqual({ existingCount: 2, savedCount: 0 })
    await expect(restarted.readUndoSnapshot()).resolves.toEqual(committed)
    expect(
      (await restarted.readInsightRecords()).map(({ url }) => url),
    ).toEqual(expect.arrayContaining([existingUrl, freshUrl]))
  })

  it('returns distinct exact saved URLs only after the IndexedDB commit', async () => {
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const existingUrl = 'https://example.com/docs'
    const freshUrl = 'https://example.com:443/docs'
    await dataPlane.saveTabs([{ title: 'Existing', url: existingUrl }])
    await expect(dataPlane.readInsightRecords()).resolves.toMatchObject([
      { title: 'Existing', url: existingUrl },
    ])

    const events: string[] = []
    const observedTransactions = new WeakSet<IDBTransaction>()
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
      function observeUrlWrite(this: IDBObjectStore, ...args) {
        const request = put.apply(this, args)
        if (this.name === PERSISTENCE_STORE_NAMES.urls) {
          request.addEventListener('success', () => {
            events.push('URL written')
          })
          const { transaction } = this
          if (!observedTransactions.has(transaction)) {
            observedTransactions.add(transaction)
            transaction.addEventListener('complete', () => {
              events.push('transaction complete')
            })
          }
        }
        return request
      },
    )

    const receipt = await dataPlane.saveTabs([
      { title: 'Updated', url: existingUrl },
      { title: 'Fresh', url: freshUrl },
      { title: 'Skipped', url: 'not a URL' },
      { title: 'Fresh duplicate', url: freshUrl },
      { title: 'Missing URL' },
    ])
    expect(events).toEqual([
      'URL written',
      'URL written',
      'transaction complete',
    ])
    expect(receipt).toEqual({ savedUrls: [existingUrl, freshUrl] })
    await expect(dataPlane.readInsightRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Updated', url: existingUrl }),
        expect.objectContaining({ title: 'Fresh duplicate', url: freshUrl }),
      ]),
    )
    await expect(dataPlane.saveTabs([{ url: 'not a URL' }])).resolves.toEqual({
      savedUrls: [],
    })
  })

  it('rejects without returning a save receipt when the write fails', async () => {
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const failure = new Error('save commit failed')
    vi.spyOn(operationGate, 'runIndexedDbWrite').mockRejectedValueOnce(failure)

    await expect(
      dataPlane.saveTabs([
        { title: 'Unsaved', url: 'https://example.com/docs' },
      ]),
    ).rejects.toBe(failure)
    await expect(dataPlane.readInsightRecords()).resolves.toEqual([])
  })

  it('saves, deletes and restores native background data while leaving IndexedDB history and views intact', async () => {
    const storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }
    mocked.getStorage.mockReturnValue(storage)
    const dataPlane = getBackgroundSavedTabsDataPlane()

    await dataPlane.saveTabs([
      { title: 'Docs', url: 'https://example.com/docs' },
    ])
    const saved = await dataPlane.readUndoSnapshot()
    expect(saved.savedTabs.urls).toHaveLength(1)
    await expect(dataPlane.readInsightRecords()).resolves.toEqual([
      expect.objectContaining({ title: 'Docs' }),
    ])
    await expect(dataPlane.readAnalyticsRecords()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Docs' })]),
    )
    const updatedAt = Date.now() + 100
    await dataPlane.updateTabTimestamps(updatedAt)
    await expect(
      dataPlane.removeExpiredUrls(updatedAt + 100, updatedAt + 200, {
        protectFavoriteFromAutoRemoval: true,
      }),
    ).resolves.toEqual({
      removedCount: 1,
      sourceCount: 1,
    })
    await dataPlane.restoreUndoSnapshot(saved)
    await expect(dataPlane.removeUrl('https://example.com/docs')).resolves.toBe(
      1,
    )
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ).readConsistentSnapshot()

    expect(snapshot.savedTabs.urls).toEqual([])
    expect(snapshot.conversations).toHaveLength(1)
    expect(snapshot.analyticsViews).toEqual([
      { id: view.id, updatedAt: 20, value: view },
    ])
    expect(storage.get).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
    expect(reads).toHaveBeenCalled()
    expect(writes).toHaveBeenCalled()
  })
})

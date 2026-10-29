import { IDBFactory } from 'fake-indexeddb'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'

import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

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
      dataPlane.removeExpiredUrls(updatedAt + 100, updatedAt + 200),
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

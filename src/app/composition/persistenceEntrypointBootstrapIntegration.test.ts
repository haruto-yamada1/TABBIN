import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBackgroundSavedTabsDataPlaneForTesting } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  getPersistenceBootstrapRuntime,
  resetPersistenceBootstrapRuntimeForTesting,
} from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { removeUrlRecordsFromStorage } from '@/lib/background/url-storage'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'

type StorageState = Record<string, unknown>

const createChromeStorage = (events: string[], initial: StorageState = {}) => {
  const state: StorageState = structuredClone(initial)
  const get = vi.fn(async (keys?: unknown) => {
    let requestedKeys: string[] = []
    if (typeof keys === 'string') {
      requestedKeys = [keys]
    } else if (Array.isArray(keys)) {
      requestedKeys = keys.map(String)
    } else if (keys && typeof keys === 'object') {
      requestedKeys = Object.keys(keys)
    }
    events.push(
      requestedKeys.length === 1 && requestedKeys[0] === 'userSettings'
        ? 'settings-get'
        : 'domain-get',
    )
    if (typeof keys === 'string') {
      return { [keys]: state[keys] }
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, state[String(key)]]))
    }
    if (keys && typeof keys === 'object') {
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          key in state ? state[key] : fallback,
        ]),
      )
    }
    return { ...state }
  })
  const set = vi.fn(async (values: StorageState) => {
    events.push('storage-set')
    Object.assign(state, values)
  })

  return {
    local: {
      clear: vi.fn(async () => {
        for (const key of Object.keys(state)) {
          delete state[key]
        }
      }),
      get,
      getBytesInUse: vi.fn(async () => 0),
      getKeys: vi.fn(async () => Object.keys(state)),
      remove: vi.fn(async (keys: string | readonly string[]) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete state[key]
        }
      }),
      set,
    },
  }
}

const setupRuntime = (events: string[], initial: StorageState = {}) => {
  const storage = createChromeStorage(events, initial)
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    },
  })
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: 'test' }) },
    storage,
  })
  resetBackgroundSavedTabsDataPlaneForTesting()
  resetPersistenceBootstrapRuntimeForTesting()
  const runtime = getPersistenceBootstrapRuntime()
  const initialize = runtime.bootstrap.ready
  const ready = vi.spyOn(runtime.bootstrap, 'ready')
  ready.mockImplementation(async () => {
    events.push('ready')
    await initialize()
  })
  return { ready, runtime, storage }
}

describe('production entrypoint persistence readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetBackgroundSavedTabsDataPlaneForTesting()
    resetPersistenceBootstrapRuntimeForTesting()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('background-first URL mutation awaits IndexedDB readiness without Chrome domain reads or writes', async () => {
    const events: string[] = []
    const { ready, storage } = setupRuntime(events)

    await expect(removeUrlRecordsFromStorage(['missing-url'])).resolves.toBe(0)

    expect(ready).toHaveBeenCalled()
    expect(storage.local.get).not.toHaveBeenCalled()
    expect(storage.local.set).not.toHaveBeenCalled()
    expect(events).toContain('ready')
    expect(events).not.toContain('domain-get')
  })

  it('background mutation preserves unrelated IndexedDB data and existing Chrome settings', async () => {
    const settings = { ...defaultSettings, showSavedTime: true }
    const { runtime, storage } = setupRuntime([], {
      userSettings: settings,
      activeAiChatConversationId: 'conversation-1',
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(
      runtime.connectionManager,
      runtime.operationGate,
    )
    await unitOfWork.commit({
      urls: {
        put: [
          {
            id: 'url-1',
            firstSavedAt: 1,
            lastSavedAt: 1,
            normalizedUrl: 'https://example.com/',
            title: 'Existing',
            updatedAt: 1,
            url: 'https://example.com/',
          },
        ],
      },
      conversations: {
        put: [
          {
            id: 'conversation-1',
            updatedAt: 1,
            value: { createdAt: 1, messageIds: [], title: 'Existing chat' },
          },
        ],
      },
    })

    await expect(removeUrlRecordsFromStorage(['url-1'])).resolves.toBe(1)
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      runtime.connectionManager,
      runtime.operationGate,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toEqual([])
    expect(snapshot.conversations).toHaveLength(1)
    expect(storage.local.get).not.toHaveBeenCalled()
    expect(storage.local.set).not.toHaveBeenCalled()
    expect(storage.local.remove).not.toHaveBeenCalled()
    expect(storage.local.clear).not.toHaveBeenCalled()
    await expect(getUserSettings()).resolves.toMatchObject({
      showSavedTime: true,
    })
    await saveUserSettings({ ...settings, showSavedTime: false })
    expect(await storage.local.get('userSettings')).toMatchObject({
      userSettings: { showSavedTime: false },
    })
    expect(await storage.local.get('activeAiChatConversationId')).toEqual({
      activeAiChatConversationId: 'conversation-1',
    })
  })

  it('failed IndexedDB readiness reports recovery and never reads old Chrome domain data', async () => {
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { runtime, storage } = setupRuntime([], {
      urls: [{ id: 'url-legacy' }],
      persistenceControlState: { status: 'legacy' },
    })
    vi.spyOn(runtime.connectionManager, 'open').mockRejectedValue(
      new Error('database unavailable'),
    )

    await expect(
      removeUrlRecordsFromStorage(['url-legacy']),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_RECOVERY_REQUIRED' })
    expect(runtime.recovery.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    })
    expect(storage.local.get).not.toHaveBeenCalled()
    expect(storage.local.set).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledOnce()
  })
})

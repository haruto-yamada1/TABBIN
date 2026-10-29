import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

import {
  getPersistenceBootstrapRuntime,
  resetPersistenceBootstrapRuntimeForTesting,
} from './persistenceBootstrapRuntime'

afterEach(() => {
  resetPersistenceBootstrapRuntimeForTesting()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('IndexedDB-only production bootstrap', () => {
  it('keeps recovery available when the IndexedDB API is missing and can retry after it returns', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    })
    const runtime = getPersistenceBootstrapRuntime()
    await expect(
      runtime.operationGate.runIndexedDbRead(async () => 'unused'),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_RECOVERY_REQUIRED' })
    expect(runtime.recovery.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    })
    vi.stubGlobal('indexedDB', new IDBFactory())
    await runtime.recovery.retry()
    expect(runtime.recovery.getSnapshot()).toEqual({ status: 'available' })
    expect(
      await runtime.operationGate.runIndexedDbRead(async () => 'ready'),
    ).toBe('ready')
  })

  it('opens an empty database without Chrome Storage or migration metadata', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    })

    const runtime = getPersistenceBootstrapRuntime()
    await expect(runtime.bootstrap.ready()).resolves.toBeUndefined()
    const manager = runtime.connectionManager
    expect(manager).toBeDefined()
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      runtime.operationGate,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toEqual([])
    manager.close()
  })

  it('ignores stale legacy data and failed migration state while preserving existing IndexedDB records across restart', async () => {
    const indexedDb = new IDBFactory()
    const existing = new IndexedDbConnectionManager({ indexedDb })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(
      existing,
      createReadyPersistenceOperationGateStub(),
    )
    const url = {
      id: 'existing-url',
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com/',
      title: 'Existing',
      firstSavedAt: 1,
      lastSavedAt: 1,
      updatedAt: 1,
    }
    await unitOfWork.commit({ urls: { put: [url] } })
    existing.close()
    const get = vi.fn(async () => ({
      urls: [{ id: 'legacy-url' }],
      persistenceControlState: { status: 'failed' },
    }))
    const set = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    vi.stubEnv('MODE', 'production')
    vi.stubGlobal('indexedDB', indexedDb)
    vi.stubGlobal('chrome', { storage: { local: { get, set, remove } } })
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    })

    const checkRestart = async () => {
      const runtime = getPersistenceBootstrapRuntime()
      await runtime.bootstrap.ready()
      const manager = runtime.connectionManager
      const snapshot = await new IndexedDbPersistenceSnapshotReader(
        manager,
        runtime.operationGate,
      ).readConsistentSnapshot()
      expect(snapshot.savedTabs.urls).toEqual([url])
      expect(snapshot.revision).toBe(1)
      manager.close()
      resetPersistenceBootstrapRuntimeForTesting()
    }
    await checkRestart()
    await checkRestart()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './IndexedDbPersistenceUnitOfWork'

const createRejectingGate = (): {
  readonly error: PersistenceUnavailableError
  readonly gate: PersistenceOperationGatePort
} => {
  const error = new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  return {
    error,
    gate: {
      runIndexedDbRead: vi.fn(async () => {
        throw error
      }),
      runIndexedDbWrite: vi.fn(async () => {
        throw error
      }),
      runLegacyRead: vi.fn(async (operation) => operation()),
      runLegacyWrite: vi.fn(async (operation) => operation()),
    },
  }
}

describe('IndexedDB persistence ready gate', () => {
  it('rejects commit before opening IndexedDB when indexeddb write is unavailable', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'ready-gate-write',
      indexedDb: new IDBFactory(),
    })
    const { error, gate } = createRejectingGate()
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)

    await expect(
      unitOfWork.commit({
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
      }),
    ).rejects.toBe(error)
    expect(gate.runIndexedDbWrite).toHaveBeenCalledTimes(1)
  })

  it('rejects revision and snapshot reads at the persistence facade', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'ready-gate-read',
      indexedDb: new IDBFactory(),
    })
    const { error, gate } = createRejectingGate()
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)

    await expect(unitOfWork.readRevision()).rejects.toBe(error)
    await expect(snapshotReader.readConsistentSnapshot()).rejects.toBe(error)
    await expect(snapshotReader.readVerifiedSavedTabsSnapshot()).rejects.toBe(
      error,
    )
    expect(gate.runIndexedDbRead).toHaveBeenCalledTimes(3)
  })
})

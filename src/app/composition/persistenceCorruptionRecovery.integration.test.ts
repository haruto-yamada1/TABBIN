import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'
import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

describe('corrupt persistence recovery', () => {
  it.each(['missing-url', 'nonnumeric-date'])(
    '%s reports recovery and retry cannot hide unresolved corruption',
    async (scenario) => {
      const manager = new IndexedDbConnectionManager({
        databaseName: scenario,
        indexedDb: new IDBFactory(),
      })
      const runtime = createPersistenceBootstrapRuntime({
        connectionManager: manager,
        coordination: {
          runExclusive: async (operation) => operation(),
          runShared: async (operation) => operation(),
        },
      })
      const database = await manager.open()
      const fixture = createExamplePersistenceFixture(1)
      const write = database.transaction(
        Object.values(PERSISTENCE_STORE_NAMES),
        'readwrite',
      )
      for (const row of fixture.collections) {
        write.objectStore(PERSISTENCE_STORE_NAMES.collections).put(row)
      }
      for (const row of fixture.memberships) {
        write.objectStore(PERSISTENCE_STORE_NAMES.memberships).put(row)
      }
      if (scenario === 'nonnumeric-date') {
        for (const row of fixture.urls) {
          write.objectStore(PERSISTENCE_STORE_NAMES.urls).put({
            ...row,
            firstSavedAt: 'private-invalid-date',
          })
        }
      }
      await waitForIndexedDbTransaction(write)
      const reader = new IndexedDbPersistenceSnapshotReader(
        manager,
        runtime.operationGate,
      )

      const expectedError =
        scenario === 'missing-url'
          ? /failed integrity validation/
          : /invalid persistence record/
      await expect(reader.readVerifiedSavedTabsSnapshot()).rejects.toThrow(
        expectedError,
      )
      expect(runtime.recovery.getSnapshot()).toEqual({
        errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
        status: 'unavailable',
      })
      await expect(runtime.recovery.retry()).rejects.toThrow(expectedError)
      expect(runtime.recovery.getSnapshot().status).toBe('unavailable')
      const reopened = await manager.open()
      const repair = reopened.transaction(
        PERSISTENCE_STORE_NAMES.urls,
        'readwrite',
      )
      for (const row of fixture.urls) {
        repair.objectStore(PERSISTENCE_STORE_NAMES.urls).put(row)
      }
      await waitForIndexedDbTransaction(repair)
      await expect(runtime.recovery.retry()).resolves.toBeUndefined()
      expect(runtime.recovery.getSnapshot().status).toBe('available')
      manager.close()
    },
  )
})

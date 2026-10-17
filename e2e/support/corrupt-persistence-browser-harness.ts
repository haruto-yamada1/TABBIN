/* eslint-disable no-restricted-imports -- browser harness exercises production persistence recovery boundaries */
import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import {
  IndexedDbPersistenceSnapshotReader,
  PersistenceSnapshotIntegrityError,
} from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { readSavedTabsRecoveryData } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsRecoveryReader'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'
import { readIndexedDbRequestResult } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/PersistenceRecordDecoders'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { BackupSchemaError } from '@/lib/persistence/backupSchema'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'
import type { UserSettings } from '@/types/storage'

export type CorruptionScenario =
  | 'missing-url'
  | 'missing-collection'
  | 'missing-category'
  | 'missing-group'
  | 'orphan-category'
  | 'nonnumeric-date'
  | 'nan-date'
  | 'orphan-url'

const serializeFailure = (error: unknown) => ({
  code:
    error instanceof PersistenceUnavailableError ||
    error instanceof BackupSchemaError
      ? error.code
      : 'UNKNOWN_ERROR',
  issueCodes:
    error instanceof PersistenceSnapshotIntegrityError
      ? error.report.issues.map(({ code }) => code)
      : [],
  message: error instanceof Error ? error.message : 'Unknown error',
  name: error instanceof Error ? error.name : 'UnknownError',
})

const observe = async <Value>(operation: () => Promise<Value>) => {
  try {
    return { status: 'fulfilled', value: await operation() } as const
  } catch (error) {
    return { status: 'rejected', ...serializeFailure(error) } as const
  }
}

export const createCorruptPersistenceBrowserHarness = (
  databaseName: string,
) => {
  const manager = new IndexedDbConnectionManager({ databaseName })
  const runtime = createPersistenceBootstrapRuntime({
    connectionManager: manager,
  })
  const reader = new IndexedDbPersistenceSnapshotReader(
    manager,
    runtime.operationGate,
  )
  const settings: UserSettings = {
    clickBehavior: 'saveCurrentTab',
    confirmDeleteAll: true,
    confirmDeleteEach: true,
    enableCategories: true,
    excludePatterns: [],
    excludePinnedTabs: false,
    openAllInNewWindow: false,
    openUrlInBackground: false,
    removeTabAfterExternalDrop: false,
    removeTabAfterOpen: false,
    showSavedTime: true,
    showRelativeSavedTime: false,
  }
  const exportBackup = createExportBackupV2UseCase({
    getAppVersion: () => '2.0.0',
    now: () => new Date(0),
    readUserSettings: async () => {
      await Promise.resolve()
      return structuredClone(settings)
    },
    snapshotReader: reader,
  })

  return {
    close: () => {
      manager.close()
    },
    exportBackup,
    inspectBackup: async (input: unknown) =>
      observe(async () => {
        await Promise.resolve()
        return inspectBackupV2(input)
      }),
    rawSnapshot: async () => {
      const database = await manager.open()
      const transaction = database.transaction(
        Array.from(database.objectStoreNames),
        'readonly',
      )
      const requests = Array.from(transaction.objectStoreNames, (name) => ({
        name,
        request: transaction.objectStore(name).getAll(),
      }))
      await waitForIndexedDbTransaction(transaction)
      return Object.fromEntries(
        requests.map(({ name, request }) => [
          name,
          readIndexedDbRequestResult(request),
        ]),
      )
    },
    read: async () =>
      observe(async () => {
        const snapshot = await reader.readConsistentSnapshot()
        return {
          ...snapshot,
          integrity: checkPersistenceIntegrity(snapshot.savedTabs),
        }
      }),
    recoveryState: () => runtime.recovery.getSnapshot(),
    rescue: async () =>
      readSavedTabsRecoveryData(manager, runtime.operationGate),
    retry: async () => observe(runtime.recovery.retry),
    seed: async (scenario: CorruptionScenario) => {
      const collection = createDomainCollectionFixture(
        'collection-1',
        'private.example.test',
        1,
      )
      const url = createUrlFixture(
        'url-1',
        'https://private.example.test/sensitive',
        'Private saved title',
        1,
      )
      const membership = {
        ...createMembershipFixture('collection-1', 'url-1', 1),
        notes: 'Private membership note',
      }
      const categories: unknown[] = []
      const groups: unknown[] = []
      const stores = {
        [PERSISTENCE_STORE_NAMES.categories]: categories,
        [PERSISTENCE_STORE_NAMES.collections]: [collection],
        [PERSISTENCE_STORE_NAMES.groups]: groups,
        [PERSISTENCE_STORE_NAMES.memberships]: [membership],
        [PERSISTENCE_STORE_NAMES.metadata]: [{ key: 'revision', value: 7 }],
        [PERSISTENCE_STORE_NAMES.urls]: [url],
      }
      switch (scenario) {
        case 'missing-url': {
          stores.urls = []
          break
        }
        case 'missing-collection': {
          stores.collections = []
          break
        }
        case 'missing-category': {
          Object.assign(membership, { categoryId: 'missing-category' })
          break
        }
        case 'missing-group': {
          Object.assign(collection, { groupId: 'missing-group' })
          break
        }
        case 'orphan-category': {
          categories.push({
            collectionId: 'missing-collection',
            createdAt: 1,
            id: 'orphan-category',
            keywords: [],
            name: 'Private orphan category',
            sortOrder: 0,
            updatedAt: 1,
          })
          break
        }
        case 'nonnumeric-date': {
          Object.assign(url, { firstSavedAt: 'Private invalid timestamp' })
          break
        }
        case 'nan-date': {
          Object.assign(url, { firstSavedAt: Number.NaN })
          break
        }
        case 'orphan-url': {
          stores.collectionMemberships = []
          break
        }
        default: {
          throw new Error('Unknown native corruption fixture.')
        }
      }
      const database = await manager.open()
      // Corruption bypasses production writers only in this explicit fixture.
      const transaction = database.transaction(Object.keys(stores), 'readwrite')
      for (const [name, records] of Object.entries(stores)) {
        for (const record of records) {
          transaction.objectStore(name).put(record)
        }
      }
      await waitForIndexedDbTransaction(transaction)
    },
  }
}

export type CorruptPersistenceBrowserHarness = ReturnType<
  typeof createCorruptPersistenceBrowserHarness
>

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window extension requires interface merging
  interface Window {
    __tabbinCorruptPersistence: CorruptPersistenceBrowserHarness
    __initializeTabbinCorruptPersistence: (databaseName: string) => void
  }
}

Object.assign(globalThis, {
  __initializeTabbinCorruptPersistence: (databaseName: string) => {
    window.__tabbinCorruptPersistence =
      createCorruptPersistenceBrowserHarness(databaseName)
  },
})

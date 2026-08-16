import { readFileSync } from 'node:fs'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
  PersistenceRecoveryReporterPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { defaultSettings } from '@/lib/storage/settings'

vi.mock('@/lib/storage/migration', () => ({
  migrateToUrlsStorage: vi.fn(),
}))

import { importSettings } from '@/features/options/lib/import-export/flows'
import { migrateToUrlsStorage } from '@/lib/storage/migration'

import {
  getOptionsLegacyBackupMergeRuntime,
  resetOptionsLegacyBackupMergeRuntimeForTesting,
} from './optionsLegacyBackupMerge'

const legacyFixture = readFileSync(
  new URL(
    '../../features/options/lib/import-export/v2/fixtures/legacy-tab-group-nested-urls.json',
    import.meta.url,
  ),
  'utf8',
)

const settingsOnlyLegacyFixture = JSON.stringify({
  parentCategories: [],
  savedTabs: [],
  timestamp: '2026-08-01T00:00:00.000Z',
  userSettings: { language: 'en' },
  version: '2.0.8',
})

const warningOnlyLegacyFixture = JSON.stringify({
  parentCategories: [],
  savedTabs: [],
  timestamp: '2026-08-15T00:00:00.000Z',
  urls: [
    {
      id: 'orphan-url',
      savedAt: 1,
      title: 'Orphan',
      url: 'https://orphan.example/',
    },
  ],
  userSettings: {},
  version: '2.0.9',
})

const indexedDbState = {
  migrationId: 'migration-1',
  persistenceGeneration: 2,
  status: 'indexeddb',
} as const satisfies PersistenceControlState

const createIndexedDbGate = (
  state: PersistenceControlState = indexedDbState,
  coordination: PersistenceCoordinationPort = {
    runExclusive: async (operation) => operation(),
    runShared: async (operation) => operation(),
  },
) => {
  const bootstrap: PersistenceBootstrapPort = {
    migrate: vi.fn(async () => undefined),
    readState: vi.fn(async () => state),
    ready: vi.fn(async () => undefined),
  }
  const controlStateRepository: PersistenceControlStateRepositoryPort = {
    read: vi.fn(async () => state),
    transition: vi.fn(),
  }
  const recovery: PersistenceRecoveryReporterPort = {
    reportUnavailable: vi.fn(),
  }
  return new PersistenceOperationGateService({
    bootstrap,
    controlStateRepository,
    coordination,
    recovery,
  })
}

const createNonReentrantCoordination = (): PersistenceCoordinationPort => {
  let active = false
  const run = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    if (active) {
      throw new Error('Nested persistence coordination is forbidden.')
    }
    active = true
    try {
      return await operation()
    } finally {
      active = false
    }
  }
  return {
    runExclusive: run,
    runShared: run,
  }
}

describe('options legacy Backup merge integration', () => {
  afterEach(() => {
    resetOptionsLegacyBackupMergeRuntimeForTesting()
    vi.restoreAllMocks()
  })

  it('merges a supported legacy backup through the IndexedDB route', async () => {
    const operationGate = createIndexedDbGate(
      indexedDbState,
      createNonReentrantCoordination(),
    )
    const connectionManager = new IndexedDbConnectionManager({
      databaseName: 'options-legacy-backup-merge',
      indexedDb: new IDBFactory(),
    })
    const writeUserSettings = vi.fn(async () => undefined)
    getOptionsLegacyBackupMergeRuntime({
      createConnectionManager: () => connectionManager,
      createUnitOfWork: (manager, gate) =>
        new IndexedDbPersistenceUnitOfWork(manager, gate),
      getOperationGate: () => operationGate,
      readUserSettings: vi.fn(async () => defaultSettings),
      writeUserSettings,
    })
    await new IndexedDbPersistenceUnitOfWork(
      connectionManager,
      operationGate,
    ).commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: {
              domain: 'existing.example',
              type: 'domain',
            },
            id: 'existing-collection',
            name: 'existing.example',
            sortOrder: 1024,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'existing-collection',
            sortOrder: 1024,
            updatedAt: 1,
            urlId: 'existing-url',
          },
        ],
      },
      urls: {
        put: [
          {
            firstSavedAt: 1,
            id: 'existing-url',
            lastSavedAt: 1,
            normalizedUrl: 'https://existing.example/',
            title: 'Existing',
            updatedAt: 1,
            url: 'https://existing.example/',
          },
        ],
      },
    })

    const result = await importSettings(legacyFixture, true, undefined, {
      importDate: '2026-08-31',
    })

    expect(result.success).toBe(true)
    expect(migrateToUrlsStorage).not.toHaveBeenCalled()
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'existing-url',
          title: 'Existing',
        }),
        expect.objectContaining({
          title: 'Nested guide',
          url: 'https://nested.example.com/guide',
        }),
      ]),
    )
    expect(snapshot.savedTabs.urls).toHaveLength(2)
    expect(snapshot.savedTabs.collections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'existing-collection',
        }),
        expect.objectContaining({
          id: 'domain-nested',
        }),
      ]),
    )
    expect(snapshot.savedTabs.collections).toHaveLength(2)
    expect(writeUserSettings).toHaveBeenCalledOnce()

    const duplicateResult = await importSettings(
      legacyFixture,
      true,
      undefined,
      {
        importDate: '2026-08-31',
      },
    )

    expect(duplicateResult).toEqual({
      message: 'データをマージしました (0個のカテゴリ、0個のドメインを追加)',
      success: true,
    })
  })

  it('imports warning-only legacy URL records into IndexedDB without making reload unreadable', async () => {
    const operationGate = createIndexedDbGate()
    const connectionManager = new IndexedDbConnectionManager({
      databaseName: 'options-legacy-warning-only',
      indexedDb: new IDBFactory(),
    })
    getOptionsLegacyBackupMergeRuntime({
      createConnectionManager: () => connectionManager,
      createUnitOfWork: (manager, gate) =>
        new IndexedDbPersistenceUnitOfWork(manager, gate),
      getOperationGate: () => operationGate,
      readUserSettings: vi.fn(async () => defaultSettings),
      writeUserSettings: vi.fn(async () => undefined),
    })

    await expect(
      importSettings(warningOnlyLegacyFixture, true, undefined, {
        importDate: '2026-08-31',
      }),
    ).resolves.toMatchObject({ success: true })

    const reloadedSnapshot = await new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ).readVerifiedSavedTabsSnapshot()
    expect(reloadedSnapshot.savedTabs.urls).toEqual([
      expect.objectContaining({ id: 'orphan-url' }),
    ])
  })

  it('rejects a settings-only legacy import while IndexedDB is read-only', async () => {
    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const operationGate = createIndexedDbGate({
      migrationId: 'migration-1',
      persistenceGeneration: 2,
      readSource: 'indexeddb',
      status: 'read-only-emergency',
    })
    const connectionManager = new IndexedDbConnectionManager({
      databaseName: 'options-legacy-settings-only-read-only',
      indexedDb: new IDBFactory(),
    })
    const readUserSettings = vi.fn(async () => defaultSettings)
    const writeUserSettings = vi.fn(async () => undefined)
    getOptionsLegacyBackupMergeRuntime({
      createConnectionManager: () => connectionManager,
      createUnitOfWork: (manager, gate) =>
        new IndexedDbPersistenceUnitOfWork(manager, gate),
      getOperationGate: () => operationGate,
      readUserSettings,
      writeUserSettings,
    })

    const result = await importSettings(
      settingsOnlyLegacyFixture,
      true,
      undefined,
      { importDate: '2026-08-31' },
    )

    expect(result.success).toBe(false)
    expect(readUserSettings).toHaveBeenCalledOnce()
    expect(writeUserSettings).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      'インポートエラー:',
      expect.objectContaining({ code: 'PERSISTENCE_READ_ONLY' }),
    )
  })

  it('replaces a cached runtime when explicit dependencies are supplied', () => {
    const firstManager = new IndexedDbConnectionManager({
      databaseName: 'options-legacy-backup-merge-first',
      indexedDb: new IDBFactory(),
    })
    const secondManager = new IndexedDbConnectionManager({
      databaseName: 'options-legacy-backup-merge-second',
      indexedDb: new IDBFactory(),
    })
    const operationGate = createIndexedDbGate()
    const createDeps = (manager: IndexedDbConnectionManager) => ({
      createConnectionManager: () => manager,
      createUnitOfWork: (
        connectionManager: IndexedDbConnectionManager,
        gate: PersistenceOperationGatePort,
      ) => new IndexedDbPersistenceUnitOfWork(connectionManager, gate),
      getOperationGate: () => operationGate,
      readUserSettings: vi.fn(async () => defaultSettings),
      writeUserSettings: vi.fn(async () => undefined),
    })

    const firstRuntime = getOptionsLegacyBackupMergeRuntime(
      createDeps(firstManager),
    )
    const secondRuntime = getOptionsLegacyBackupMergeRuntime(
      createDeps(secondManager),
    )

    expect(secondRuntime).not.toBe(firstRuntime)
  })
})

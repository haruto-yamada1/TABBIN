import { createMigrationPreflightController } from '@/app/composition/createMigrationPreflightController'
import { createRouteAwareSavedTabsUseCasesForTesting } from '@/app/composition/createSavedTabsUseCases.testing'
/* eslint-disable no-restricted-imports, typescript/require-await -- this test-only browser bundle deliberately exercises async port callbacks across the saved-tabs implementation boundary */
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import { MigrationPreflightService } from '@/contexts/saved-tabs/application/services/MigrationPreflightService'
import { PersistenceDataPlaneRouterService } from '@/contexts/saved-tabs/application/services/PersistenceDataPlaneRouterService'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { PersistenceRecoveryService } from '@/contexts/saved-tabs/application/services/PersistenceRecoveryService'
import { PersistenceV2MigrationService } from '@/contexts/saved-tabs/application/services/PersistenceV2MigrationService'
import { WebLocksPersistenceCoordinationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { ChromeRawLegacyStorageReader } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeRawLegacyStorageReader'
import {
  ChromeMigrationPreflightReader,
  ChromeMigrationPreflightRepository,
} from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromeMigrationPreflightRepository'
import { ChromePersistenceControlStateRepository } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository'
import { Sha256MigrationSourceFingerprint } from '@/contexts/saved-tabs/infrastructure/persistence/fingerprint/Sha256MigrationSourceFingerprint'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbSavedTabsQueryAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter'
import { IndexedDbPersistenceMigrationTarget } from '@/contexts/saved-tabs/infrastructure/persistence/migrations/IndexedDbPersistenceMigrationTarget'
import { createCompletePersistenceBootstrapServiceForTesting } from '@/contexts/saved-tabs/testing/createCompletePersistenceBootstrapService'
import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { defaultSettings } from '@/lib/storage/settings'

const MIGRATION_ID = 'firefox-persistence-v2-smoke'

const readChromeStorageError = (): Error | undefined => {
  const lastError = chrome.runtime.lastError
  return lastError ? new Error(lastError.message) : undefined
}

const storage = {
  clear: async (): Promise<void> =>
    new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        const error = readChromeStorageError()
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    }),
  get: async (
    keys: string | readonly string[],
  ): Promise<Record<string, unknown>> => {
    const selected = typeof keys === 'string' ? keys : [...keys]
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(selected, (values) => {
        const error = readChromeStorageError()
        if (error) {
          reject(error)
          return
        }
        resolve(values)
      })
    })
  },
  set: async (values: Record<string, unknown>): Promise<void> =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = readChromeStorageError()
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    }),
}

const selectedIndexedDbGate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  runLegacyRead: async (operation) => operation(),
  runLegacyWrite: async (operation) => operation(),
}

const readLegacySource = async (): Promise<Record<string, unknown>> =>
  storage.get(MIGRATION_SOURCE_KEYS)

const createCoordination = (): WebLocksPersistenceCoordinationAdapter =>
  new WebLocksPersistenceCoordinationAdapter({
    getLockManager: () => navigator.locks,
  })

const createControlStateRepository = () =>
  new ChromePersistenceControlStateRepository({
    getManifest: () => chrome.runtime.getManifest(),
    getStorageLocal: () => storage,
  })

const createMigrationLifecycle = (
  connectionManager: IndexedDbConnectionManager,
): PersistenceV2MigrationService => {
  const rawReader = new ChromeRawLegacyStorageReader(storage)
  return new PersistenceV2MigrationService({
    fingerprint: new Sha256MigrationSourceFingerprint(),
    preflightRepository: new ChromeMigrationPreflightReader(storage),
    rawReader,
    target: new IndexedDbPersistenceMigrationTarget(connectionManager),
  })
}

const createRouter = (
  connectionManager: IndexedDbConnectionManager,
  withMigrationLifecycle: boolean,
) => {
  const controlStateRepository = createControlStateRepository()
  const coordination = createCoordination()
  const bootstrap = createCompletePersistenceBootstrapServiceForTesting({
    access: controlStateRepository,
    controlStateRepository,
    coordination,
    ...(withMigrationLifecycle
      ? { migrationLifecycle: createMigrationLifecycle(connectionManager) }
      : {}),
  })
  const recovery = new PersistenceRecoveryService({
    retry: async () => bootstrap.ready(),
  })
  return {
    bootstrap,
    controlStateRepository,
    operationGate: new PersistenceOperationGateService({
      bootstrap,
      controlStateRepository,
      coordination,
      recovery,
    }),
    router: new PersistenceDataPlaneRouterService({
      bootstrap,
      controlStateRepository,
      coordination,
      recovery,
    }),
  }
}

const seedLegacyFixture = async (): Promise<void> => {
  await storage.clear()
  await storage.set({
    customProjectOrder: ['project-1'],
    customProjects: [
      {
        categories: ['research'],
        categoryOrder: ['research'],
        createdAt: 3,
        id: 'project-1',
        name: 'Firefox project',
        updatedAt: 4,
        urls: [
          {
            category: 'research',
            notes: 'firefox private note',
            savedAt: 5,
            title: 'Firefox custom URL',
            url: 'https://example.com/custom',
          },
        ],
      },
    ],
    savedTabs: [
      {
        domain: 'example.com',
        id: 'collection-1',
        savedAt: 1,
        subCategories: ['docs'],
        urls: [
          {
            savedAt: 2,
            subCategory: 'docs',
            title: 'Firefox domain URL',
            url: 'https://example.com/domain',
          },
        ],
      },
    ],
  })
}

const createPreflightService = (): MigrationPreflightService => {
  const coordination = createCoordination()
  const rawReader = new ChromeRawLegacyStorageReader(storage)
  return new MigrationPreflightService({
    capacityPolicy: {
      minimumReserveBytes: 1024,
      reserveRatio: 0.01,
    },
    coordination,
    estimateStorage: async () => ({ quota: 100_000_000, usage: 0 }),
    fingerprint: new Sha256MigrationSourceFingerprint(),
    now: () => Date.now(),
    rawReader,
    repository: new ChromeMigrationPreflightRepository(storage),
  })
}

const createQuery = (
  connectionManager: IndexedDbConnectionManager,
): IndexedDbSavedTabsQueryAdapter =>
  new IndexedDbSavedTabsQueryAdapter(
    new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      selectedIndexedDbGate,
    ),
  )

const countProjection = async (
  query: IndexedDbSavedTabsQueryAdapter,
): Promise<{ collections: number; memberships: number; urls: number }> => {
  const projection = await query.readInitialLoad()
  return {
    collections: projection.collections.length,
    memberships: projection.collections.reduce(
      (count, collection) => count + collection.items.length,
      0,
    ),
    urls: new Set(
      projection.collections.flatMap((collection) =>
        collection.items.map((item) => item.url.id),
      ),
    ).size,
  }
}

const exportBackup = async (
  connectionManager: IndexedDbConnectionManager,
  operationGate: PersistenceOperationGatePort,
) => {
  const exportBackupV2 = createExportBackupV2UseCase({
    getAppVersion: () => 'firefox-migration-smoke',
    now: () => new Date('2026-08-08T00:00:00.000Z'),
    readUserSettings: async () => defaultSettings,
    snapshotReader: new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ),
  })
  return BackupEnvelopeV2Schema.parse(await exportBackupV2())
}

const migrate = async () => {
  await seedLegacyFixture()
  const legacySourceBefore = await readLegacySource()

  const connectionManager = new IndexedDbConnectionManager()
  const { bootstrap, controlStateRepository, operationGate, router } =
    createRouter(connectionManager, true)
  const preflight = createPreflightService()
  const startupMigration = createMigrationPreflightController({
    bootstrap,
    migrationId: MIGRATION_ID,
    service: preflight,
  })
  await startupMigration.run()
  const preflightStatus = await preflight.readStatus()
  if (preflightStatus.status !== 'healthy') {
    throw new Error(
      `Firefox migration preflight was ${preflightStatus.status}.`,
    )
  }

  let fallbackCalls = 0
  const query = createQuery(connectionManager)
  const projection = await router.read({
    indexeddb: async () => countProjection(query),
    legacy: async () => {
      fallbackCalls += 1
      throw new Error('Legacy fallback is forbidden after cutover.')
    },
  })
  const backup = await exportBackup(connectionManager, operationGate)
  const state = await controlStateRepository.read()
  connectionManager.close()

  return {
    backup,
    fallbackCalls,
    legacySourceBefore,
    preflightStatus: preflightStatus.status,
    projection,
    state,
  }
}

class FailingIndexedDbFactory implements IDBFactory {
  readonly cmp = indexedDB.cmp.bind(indexedDB)
  readonly databases = indexedDB.databases.bind(indexedDB)
  readonly deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB)

  open(): IDBOpenDBRequest {
    throw new Error('forced Firefox IndexedDB open failure')
  }
}

const failingIndexedDbFactory = new FailingIndexedDbFactory()

const verifyAfterRestart = async () => {
  const connectionManager = new IndexedDbConnectionManager()
  const { controlStateRepository, operationGate, router } = createRouter(
    connectionManager,
    false,
  )
  const query = createQuery(connectionManager)
  const savedTabsUseCases = createRouteAwareSavedTabsUseCasesForTesting({
    indexeddb: createIndexedDbSavedTabsUseCases({ connectionManager }),
    router,
  })
  const savedTabsPageData = await savedTabsUseCases.getSavedTabsPageData()
  if (savedTabsPageData.tabGroups.length === 0) {
    throw new Error('Production IndexedDB Saved Tabs read returned no groups.')
  }
  await savedTabsUseCases.addUrlToCustomProject({
    category: 'research',
    notes: 'written after Firefox restart',
    projectId: 'project-1',
    title: 'Firefox IndexedDB write',
    url: 'https://example.com/firefox-write',
  })

  const projection = await router.read({
    indexeddb: async () => countProjection(query),
    legacy: async () => {
      throw new Error('Legacy fallback is forbidden after write.')
    },
  })
  const legacySourceAfterWrite = await readLegacySource()

  let fallbackCalls = 0
  let indexedDbFailureName = ''
  const failingQuery = createQuery(
    new IndexedDbConnectionManager({ indexedDb: failingIndexedDbFactory }),
  )
  try {
    await router.read({
      indexeddb: async () => failingQuery.readInitialLoad(),
      legacy: async () => {
        fallbackCalls += 1
        throw new Error('Legacy fallback is forbidden after IndexedDB failure.')
      },
    })
  } catch (error) {
    indexedDbFailureName =
      error instanceof Error ? error.name : 'NonErrorIndexedDbFailure'
  }

  const backup = await exportBackup(connectionManager, operationGate)
  const state = await controlStateRepository.read()
  connectionManager.close()

  return {
    backup,
    fallbackCalls,
    indexedDbFailureName,
    legacySourceAfterWrite,
    projection,
    savedTabsReadCount: savedTabsPageData.tabGroups.length,
    state,
  }
}

export type FirefoxPersistenceMigrationSmokePhase = 'migrate' | 'verify'

export const runFirefoxPersistenceMigrationSmoke = async (
  phase: FirefoxPersistenceMigrationSmokePhase,
) => (phase === 'migrate' ? migrate() : verifyAfterRestart())

Object.assign(globalThis, {
  __tabbinFirefoxPersistenceMigrationSmoke: {
    runFirefoxPersistenceMigrationSmoke,
  },
})

/* eslint-disable no-restricted-imports -- browser-only harness exercises real saved-tabs persistence adapters */
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbSavedTabsQueryAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { defaultSettings } from '@/lib/storage/settings'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
  obsoletePersistenceStorageFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

const storageKeys = Object.keys(obsoletePersistenceStorageFixture)

const readStorageError = (): Error | undefined => {
  const lastError = chrome.runtime.lastError
  return lastError ? new Error(lastError.message) : undefined
}

const readObsoleteStorage = async (): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    chrome.storage.local.get(storageKeys, (values) => {
      const error = readStorageError()
      if (error) {
        reject(error)
        return
      }
      resolve(values)
    })
  })

const seedObsoleteStorage = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.storage.local.set(obsoletePersistenceStorageFixture, () => {
      const error = readStorageError()
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

const withoutStorageAccess = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  const local = chrome.storage.local
  const methods = ['clear', 'get', 'getBytesInUse', 'remove', 'set'] as const
  const descriptors = methods.map((method) => ({
    descriptor: Object.getOwnPropertyDescriptor(local, method),
    method,
  }))
  try {
    for (const method of methods) {
      Object.defineProperty(local, method, {
        configurable: true,
        value: () => {
          throw new Error(
            `IndexedDB bootstrap accessed chrome.storage.${method}`,
          )
        },
      })
    }
    return await operation()
  } finally {
    for (const { descriptor, method } of descriptors) {
      if (descriptor) {
        Object.defineProperty(local, method, descriptor)
      } else {
        Reflect.deleteProperty(local, method)
      }
    }
  }
}

const countProjection = async (
  connectionManager: IndexedDbConnectionManager,
  operationGate: PersistenceOperationGatePort,
) => {
  const query = new IndexedDbSavedTabsQueryAdapter(
    new IndexedDbPersistenceSnapshotReader(connectionManager, operationGate),
  )
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
    getAppVersion: () => 'firefox-indexeddb-smoke',
    now: () => new Date('2026-10-01T00:00:00.000Z'),
    readUserSettings: async () => {
      await Promise.resolve()
      return defaultSettings
    },
    snapshotReader: new IndexedDbPersistenceSnapshotReader(
      connectionManager,
      operationGate,
    ),
  })
  return BackupEnvelopeV2Schema.parse(await exportBackupV2())
}

const seedDomain = async (
  connectionManager: IndexedDbConnectionManager,
): Promise<void> => {
  const database = await connectionManager.open()
  const transaction = database.transaction(
    [
      'collections',
      'collectionMemberships',
      'urls',
      'metadata',
      'conversations',
      'messages',
      'analyticsViews',
    ],
    'readwrite',
  )
  transaction
    .objectStore('collections')
    .put(createDomainCollectionFixture('collection-1', 'example.com', 1))
  transaction
    .objectStore('collectionMemberships')
    .put(createMembershipFixture('collection-1', 'url-1', 2))
  transaction
    .objectStore('urls')
    .put(
      createUrlFixture(
        'url-1',
        'https://example.com/domain',
        'Firefox domain URL',
        2,
      ),
    )
  transaction.objectStore('metadata').put({ key: 'revision', value: 1 })
  transaction.objectStore('conversations').put({
    id: 'conversation-1',
    updatedAt: 2,
    value: { title: 'Firefox conversation' },
  })
  transaction.objectStore('messages').put({
    conversationId: 'conversation-1',
    createdAt: 2,
    id: 'message-1',
    value: { content: 'Firefox message', role: 'user' },
  })
  transaction.objectStore('analyticsViews').put({
    id: 'view-1',
    updatedAt: 2,
    value: { kind: 'weekly' },
  })
  await waitForIndexedDbTransaction(transaction)
}

const fresh = async () => {
  const runtime = createPersistenceBootstrapRuntime()
  const emptyProjection = await withoutStorageAccess(async () => {
    await runtime.bootstrap.ready()
    return countProjection(runtime.connectionManager, runtime.operationGate)
  })
  if (emptyProjection.collections !== 0 || emptyProjection.urls !== 0) {
    throw new Error('Fresh Firefox profile must start with empty IndexedDB.')
  }
  await seedObsoleteStorage()
  await withoutStorageAccess(async () => runtime.bootstrap.ready())
  await seedDomain(runtime.connectionManager)
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: runtime.connectionManager,
    operationGate: runtime.operationGate,
  })
  const { project } = await useCases.createCustomProject({
    name: 'Firefox project',
  })
  await useCases.addCategoryToCustomProject({
    categoryName: 'research',
    projectId: project.id,
  })
  await useCases.addUrlToCustomProject({
    category: 'research',
    notes: 'firefox private note',
    projectId: project.id,
    title: 'Firefox custom URL',
    url: 'https://example.com/custom',
  })
  const result = {
    backup: await exportBackup(
      runtime.connectionManager,
      runtime.operationGate,
    ),
    emptyProjection,
    obsoleteStorageBefore: await readObsoleteStorage(),
    projection: await countProjection(
      runtime.connectionManager,
      runtime.operationGate,
    ),
    storageIndependent: true,
  }
  runtime.connectionManager.close()
  return result
}

class RecoverableIndexedDbFactory implements IDBFactory {
  failOpen = true
  readonly cmp = indexedDB.cmp.bind(indexedDB)
  readonly databases = indexedDB.databases.bind(indexedDB)
  readonly deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB)

  open(name: string, version?: number): IDBOpenDBRequest {
    if (this.failOpen) {
      throw new Error('forced Firefox IndexedDB open failure')
    }
    return indexedDB.open(name, version)
  }
}

const verifyRecovery = async () => {
  const indexedDb = new RecoverableIndexedDbFactory()
  const runtime = createPersistenceBootstrapRuntime({
    connectionManager: new IndexedDbConnectionManager({
      databaseName: 'firefox-indexeddb-recovery-smoke',
      indexedDb,
    }),
  })
  let indexedDbFailureName = ''
  let failedOperationCalls = 0
  try {
    await runtime.operationGate.runIndexedDbWrite(async () => {
      failedOperationCalls += 1
      await Promise.resolve()
    })
  } catch (error) {
    indexedDbFailureName =
      error instanceof Error ? error.name : 'NonErrorFailure'
  }
  const recoveryAfterFailure = runtime.recovery.getSnapshot().status
  indexedDb.failOpen = false
  await runtime.recovery.retry()
  const recoveryAfterRetry = runtime.recovery.getSnapshot().status
  await runtime.operationGate.runIndexedDbWrite(async () => {
    await Promise.resolve()
  })
  runtime.connectionManager.close()
  return {
    failedOperationCalls,
    indexedDbFailureName,
    recoveryAfterFailure,
    recoveryAfterRetry,
  }
}

const verifyAfterRestart = async () => {
  const runtime = createPersistenceBootstrapRuntime()
  await withoutStorageAccess(async () => runtime.bootstrap.ready())
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: runtime.connectionManager,
    operationGate: runtime.operationGate,
  })
  const savedTabsPageData = await useCases.getSavedTabsPageData()
  const projects = await useCases.getCustomProjects()
  const project = projects.find(({ name }) => name === 'Firefox project')
  if (!project || savedTabsPageData.tabGroups.length !== 1) {
    throw new Error('IndexedDB rows were not retained after Firefox restart.')
  }
  await useCases.addUrlToCustomProject({
    category: 'research',
    notes: 'written after Firefox restart',
    projectId: project.id,
    title: 'Firefox IndexedDB write',
    url: 'https://example.com/firefox-write',
  })
  const result = {
    backup: await exportBackup(
      runtime.connectionManager,
      runtime.operationGate,
    ),
    obsoleteStorageAfterWrite: await readObsoleteStorage(),
    projection: await countProjection(
      runtime.connectionManager,
      runtime.operationGate,
    ),
    savedTabsReadCount: savedTabsPageData.tabGroups.length,
    storageIndependent: true,
    ...(await verifyRecovery()),
  }
  runtime.connectionManager.close()
  return result
}

export type FirefoxPersistenceSmokePhase = 'fresh' | 'verify'

export const runFirefoxPersistenceSmoke = async (
  phase: FirefoxPersistenceSmokePhase,
) => (phase === 'fresh' ? fresh() : verifyAfterRestart())

Object.assign(globalThis, {
  __tabbinFirefoxPersistenceSmoke: { runFirefoxPersistenceSmoke },
})

import { IDBFactory } from 'fake-indexeddb'

import { createBackgroundSavedTabsIndexedDbDataPlane } from '@/app/composition/backgroundSavedTabsIndexedDbDataPlane'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import type { BackupEnvelopeV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import type { UserSettings } from '@/types/storage'

export const createPersistenceRuntime = async () => {
  const gate = {
    runIndexedDbRead: async <T>(operation: () => Promise<T>) => operation(),
    runIndexedDbWrite: async <T>(operation: () => Promise<T>) => operation(),
  }
  const manager = new IndexedDbConnectionManager({
    indexedDb: new IDBFactory(),
    databaseName: 'synthetic-state-model',
  })
  const unit = new IndexedDbPersistenceUnitOfWork(manager, gate)
  await unit.commit({
    collections: {
      put: [0, 1].map((slot) => ({
        id: `p${slot}`,
        name: `Project ${slot}`,
        createdAt: 1,
        updatedAt: 1,
        sortOrder: slot,
        definition: {
          type: 'custom' as const,
          projectKeywords: {
            domainKeywords: [],
            titleKeywords: [],
            urlKeywords: [],
          },
        },
      })),
    },
    categories: {
      put: [0, 1].map((slot) => ({
        id: `c${slot}`,
        collectionId: `p${slot}`,
        name: 'category',
        keywords: [],
        createdAt: 1,
        updatedAt: 1,
        sortOrder: 0,
      })),
    },
    groups: {
      put: [0, 1].map((slot) => ({
        id: `g${slot}`,
        name: `Group ${slot}`,
        createdAt: 1,
        updatedAt: 1,
        sortOrder: slot,
      })),
    },
  })
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const runtime = createNativeIndexedDbSavedTabsRuntime({
    connectionManager: manager,
    operationGate: gate,
  })
  const allocatedIds = new Set<string>()
  let nextId = 0
  const clock = { time: 10 }
  const snapshots: {
    undo: PersistenceLogicalSnapshot | null
    backupSnapshot: PersistenceLogicalSnapshot | null
    backup: BackupEnvelopeV2 | null
    operations: string[]
  } = { undo: null, backupSnapshot: null, backup: null, operations: [] }
  const real = {
    ...snapshots,
    clock,
    allocatedIds,
    manager,
    reader,
    unit,
    dataPlane: createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => {
        const id = `generated-${++nextId}`
        allocatedIds.add(id)
        return id
      },
      now: () => clock.time,
      readSnapshot: async () => reader.readVerifiedSavedTabsSnapshot(),
      session: runtime.session,
    }),
    useCases: createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
      operationGate: gate,
    }),
  }
  let settings: UserSettings = {
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
  }
  const readUserSettings = async (): Promise<UserSettings> => {
    await Promise.resolve()
    return structuredClone(settings)
  }
  const replacement = new IndexedDbPersistenceReplacementAdapter(manager, gate)
  const exportBackup = createExportBackupV2UseCase({
    getAppVersion: () => '2.0.8',
    now: () => new Date(clock.time),
    readUserSettings,
    snapshotReader: reader,
  })
  let recovery: PersistenceLogicalSnapshot | null = null
  const importBackup = createImportBackupV2UseCase({
    normalizeUserSettings: (value) => value,
    readUserSettings,
    writeUserSettings: async (value) => {
      settings = structuredClone(value)
      await Promise.resolve()
    },
    replacement,
    snapshotReader: reader,
    recovery: {
      captureBeforeOverwrite: async () => {
        recovery = await reader.readConsistentSnapshot()
        return 'synthetic-recovery'
      },
      restore: async () => {
        if (!recovery) {
          throw new Error('RECOVERY_MISSING')
        }
        await replacement.replaceAll(recovery)
      },
    },
  })
  return Object.assign(real, { exportBackup, importBackup })
}
export type PersistenceRuntime = Awaited<
  ReturnType<typeof createPersistenceRuntime>
>

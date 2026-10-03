import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { createHealthyPersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/public-api'
import { BackupMapper } from '@/features/options/lib/import-export/v2/BackupMapper'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import { canonicalUserSettings } from '@/test/arbitraries/persistence/backupArbitrary'
import type { UserSettings } from '@/types/storage'

describe('Child category Backup V2 recovery', () => {
  it('preserves uncategorized position through IndexedDB import and recovery after reopening', async () => {
    const indexedDb = new IDBFactory()
    const connectionOptions = {
      databaseName: 'backup-uncategorized-position-roundtrip',
      indexedDb,
    }
    const manager = new IndexedDbConnectionManager(connectionOptions)
    const gate = createReadyPersistenceOperationGateStub()
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)
    const replacement = new IndexedDbPersistenceReplacementAdapter(
      manager,
      gate,
    )
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      gate,
    )
    let settings: UserSettings = structuredClone(canonicalUserSettings)
    const settingsDeps = {
      readUserSettings: async () => structuredClone(settings),
      writeUserSettings: async (value: UserSettings) => {
        settings = structuredClone(value)
      },
    }
    let nextId = 0
    const recovery = createPreImportRecoverySnapshotService({
      ...settingsDeps,
      changePort: {
        publish: async () => undefined,
        subscribe: () => () => undefined,
      },
      clock: { now: () => 1_000 },
      estimateStorage: async () => ({ quota: 512 * 1024 * 1024, usage: 0 }),
      idGenerator: { generate: () => `position-recovery-${++nextId}` },
      replacement,
      repository,
      snapshotReader,
    })
    const snapshot: PersistenceLogicalSnapshot = {
      analyticsViews: [],
      conversations: [],
      messages: [],
      revision: 0,
      savedTabs: createHealthyPersistenceV2Snapshot(),
    }
    const sourceCollection = snapshot.savedTabs.collections[0]
    if (!sourceCollection) {
      throw new Error('Expected collection fixture')
    }
    const exportedCollection = {
      ...sourceCollection,
      uncategorizedCategoryPosition: 0,
    }
    const previousCollection = {
      ...sourceCollection,
      uncategorizedCategoryPosition: 1,
    }
    const expectedSavedTabs = BackupMapper.toBackupData(
      snapshot,
      canonicalUserSettings,
    ).savedTabs
    const reopenedManager = new IndexedDbConnectionManager(connectionOptions)
    const reopenedReader = new IndexedDbPersistenceSnapshotReader(
      reopenedManager,
      gate,
    )

    try {
      await replacement.replaceAll({
        ...snapshot,
        savedTabs: {
          ...snapshot.savedTabs,
          collections: snapshot.savedTabs.collections.map((collection) =>
            collection.id === sourceCollection.id
              ? exportedCollection
              : collection,
          ),
        },
      })
      const envelope = await createExportBackupV2UseCase({
        ...settingsDeps,
        getAppVersion: () => '2026.10.3',
        now: () => new Date('2026-10-03T00:00:00.000Z'),
        snapshotReader,
      })()
      const inspection = inspectBackupV2(JSON.stringify(envelope))

      await replacement.replaceAll({
        ...snapshot,
        savedTabs: {
          ...snapshot.savedTabs,
          collections: snapshot.savedTabs.collections.map((collection) =>
            collection.id === sourceCollection.id
              ? previousCollection
              : collection,
          ),
        },
      })
      let recoveryId = ''
      await createImportBackupV2UseCase({
        ...settingsDeps,
        recovery: {
          captureBeforeOverwrite: async () => {
            const captured = await recovery.captureBeforeOverwrite()
            recoveryId = captured.id
            return captured.id
          },
          restore: async () => {
            await recovery.restore(recoveryId)
          },
        },
        replacement,
        snapshotReader,
      })(inspection)

      manager.close()
      const imported = await reopenedReader.readConsistentSnapshot()
      expect(imported.savedTabs).toStrictEqual({
        ...expectedSavedTabs,
        collections: expectedSavedTabs.collections.map((collection) =>
          collection.id === sourceCollection.id
            ? exportedCollection
            : collection,
        ),
      })
      reopenedManager.close()

      await recovery.restore(recoveryId)
      manager.close()
      const restored = await reopenedReader.readConsistentSnapshot()
      expect(restored.savedTabs).toStrictEqual({
        ...expectedSavedTabs,
        collections: expectedSavedTabs.collections.map((collection) =>
          collection.id === sourceCollection.id
            ? previousCollection
            : collection,
        ),
      })
    } finally {
      manager.close()
      reopenedManager.close()
    }
  })
})

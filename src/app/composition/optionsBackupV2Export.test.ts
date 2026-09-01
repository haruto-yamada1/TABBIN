import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  PersistenceBootstrapPort,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
  PersistenceRecoveryReporterPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { assertProductionImportAllowed } from '@/features/options/lib/import-export/productionImportGate'
import type { BackupEnvelopeV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { defaultSettings } from '@/lib/storage/settings'

import {
  getOptionsBackupV2ExportRuntime,
  resetOptionsBackupV2ExportRuntimeForTesting,
} from './optionsBackupV2Export'

const envelope = {
  appVersion: '2.0.16',
  data: {
    analyticsViews: [],
    conversations: [],
    messages: [],
    savedTabs: {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    },
    userSettings: {
      clickBehavior: 'saveSameDomainTabs',
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: [],
      excludePinnedTabs: true,
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: false,
      showSavedTime: false,
    },
  },
  exportedAt: '2026-07-28T00:00:00.000Z',
  schemaVersion: 2,
} satisfies BackupEnvelopeV2

describe('optionsBackupV2Export composition', () => {
  beforeEach(() => {
    resetOptionsBackupV2ExportRuntimeForTesting()
  })

  it('wires one lazy connection and snapshot reader into the V2 exporter', async () => {
    const close = vi.fn()
    const connectionManager = {
      close,
    } as unknown as IndexedDbConnectionManager
    const operationGate = {} as PersistenceOperationGatePort
    const snapshotReader = {
      readConsistentSnapshot: vi.fn(),
    }
    const exportBackupV2 = vi.fn().mockResolvedValue(envelope)
    const createConnectionManager = vi.fn(() => connectionManager)
    const createSnapshotReader = vi.fn(() => snapshotReader)
    const createExportUseCase = vi.fn(() => exportBackupV2)
    let resolvePreparation: (() => void) | undefined
    const preparation = new Promise<void>((resolve) => {
      resolvePreparation = resolve
    })
    const preparePersistence = vi.fn(async () => preparation)
    const deps = {
      createConnectionManager,
      createExportUseCase,
      createSnapshotReader,
      getAppVersion: vi.fn(() => '2.0.16'),
      getOperationGate: vi.fn(() => operationGate),
      now: vi.fn(() => new Date('2026-07-28T00:00:00.000Z')),
      preparePersistence,
      readUserSettings: vi.fn(),
    }

    const first = getOptionsBackupV2ExportRuntime(deps)
    const second = getOptionsBackupV2ExportRuntime(deps)

    expect(second).toBe(first)
    expect(createConnectionManager).toHaveBeenCalledOnce()
    expect(createSnapshotReader).toHaveBeenCalledWith(
      connectionManager,
      operationGate,
    )
    expect(createExportUseCase).toHaveBeenCalledWith({
      getAppVersion: deps.getAppVersion,
      now: deps.now,
      readUserSettings: deps.readUserSettings,
      snapshotReader,
    })
    const exportResult = first.exportBackupV2()
    await Promise.resolve()
    expect(preparePersistence).toHaveBeenCalledOnce()
    expect(exportBackupV2).not.toHaveBeenCalled()

    resolvePreparation?.()
    await expect(exportResult).resolves.toBe(envelope)
    expect(exportBackupV2).toHaveBeenCalledOnce()

    resetOptionsBackupV2ExportRuntimeForTesting()
    expect(close).toHaveBeenCalledOnce()
  })

  it('exports Backup V2 through the real gate while IndexedDB is read-only', async () => {
    const state = {
      migrationId: 'migration-1',
      persistenceGeneration: 2,
      readSource: 'indexeddb',
      status: 'read-only-emergency',
    } as const
    const bootstrap: PersistenceBootstrapPort = {
      migrate: vi.fn(async () => undefined),
      readState: vi.fn(async () => state),
      ready: vi.fn(async () => undefined),
    }
    const controlStateRepository: PersistenceControlStateRepositoryPort = {
      read: vi.fn(async () => state),
      transition: vi.fn(),
    }
    const coordination: PersistenceCoordinationPort = {
      runExclusive: async (operation) => operation(),
      runShared: async (operation) => operation(),
    }
    const recovery: PersistenceRecoveryReporterPort = {
      reportUnavailable: vi.fn(),
    }
    const operationGate = new PersistenceOperationGateService({
      bootstrap,
      controlStateRepository,
      coordination,
      recovery,
    })
    const connectionManager = new IndexedDbConnectionManager({
      databaseName: 'read-only-backup-v2-export',
      indexedDb: new IDBFactory(),
    })

    const runtime = getOptionsBackupV2ExportRuntime({
      createConnectionManager: () => connectionManager,
      createExportUseCase: createExportBackupV2UseCase,
      createSnapshotReader: (manager, gate) =>
        new IndexedDbPersistenceSnapshotReader(manager, gate),
      getAppVersion: () => '2.0.16',
      getOperationGate: () => operationGate,
      now: () => new Date('2026-08-01T00:00:00.000Z'),
      preparePersistence: vi.fn(async () => undefined),
      readUserSettings: async () => defaultSettings,
    })

    const backup = await runtime.exportBackupV2()
    expect(backup).toMatchObject({
      appVersion: '2.0.16',
      data: {
        savedTabs: {
          categories: [],
          collections: [],
          groups: [],
          memberships: [],
          urls: [],
        },
        userSettings: defaultSettings,
      },
      schemaVersion: 2,
    })
    expect(
      assertProductionImportAllowed(JSON.stringify(backup), {
        importDate: '2026-08-12',
        importMode: 'overwrite',
      }),
    ).toMatchObject({
      inspection: { preview: { formatKind: 'current-v2' } },
      kind: 'v2-overwrite',
    })
    expect(recovery.reportUnavailable).not.toHaveBeenCalled()
  })
})

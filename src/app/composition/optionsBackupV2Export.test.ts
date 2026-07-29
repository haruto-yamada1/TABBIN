import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import type { BackupEnvelopeV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'

import {
  getOptionsBackupV2ExportRuntime,
  resetOptionsBackupV2ExportRuntimeForTesting,
} from './optionsBackupV2Export'

const envelope = {
  appVersion: '2.0.8',
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
    const deps = {
      createConnectionManager,
      createExportUseCase,
      createSnapshotReader,
      getAppVersion: vi.fn(() => '2.0.8'),
      getOperationGate: vi.fn(() => operationGate),
      now: vi.fn(() => new Date('2026-07-28T00:00:00.000Z')),
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
    await expect(first.exportBackupV2()).resolves.toBe(envelope)
    expect(exportBackupV2).toHaveBeenCalledOnce()

    resetOptionsBackupV2ExportRuntimeForTesting()
    expect(close).toHaveBeenCalledOnce()
  })
})

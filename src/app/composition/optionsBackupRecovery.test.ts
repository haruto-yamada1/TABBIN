import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceRecoverySnapshotRepositoryPort } from '@/contexts/saved-tabs/application/ports/PersistenceRecoverySnapshotPort'
import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import type {
  ImportBackupV2UseCase,
  ImportBackupV2UseCaseDeps,
} from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import type {
  PreImportRecoverySnapshotServiceDeps,
  RecoverySnapshotService,
} from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'

import {
  getOptionsBackupRecoveryRuntime,
  resetOptionsBackupRecoveryRuntimeForTesting,
} from './optionsBackupRecovery'

const createRecoveryListing = () => {
  const bootstrap = {
    ready: vi.fn(async () => undefined),
  }
  const summary = {
    createdAt: 100,
    expiresAt: 2_000,
    id: 'recovery-1',
    serializedBytes: 500,
    sourceRevision: 3,
  }
  const listAvailable = vi.fn(async () => [summary])
  const unexpected = async (): Promise<never> => {
    throw new Error('Listing must not read or overwrite backup contents')
  }
  const deps = {
    changePort: { publish: async () => undefined, subscribe: () => () => {} },
    clock: { now: () => 1_000 },
    createConnectionManager: () =>
      new IndexedDbConnectionManager({ indexedDb: new IDBFactory() }),
    createImportUseCase: createImportBackupV2UseCase,
    createRecoveryRepository: () => ({
      findAvailableById: unexpected,
      listAvailable,
      saveWithRetention: unexpected,
    }),
    createRecoveryService: createPreImportRecoverySnapshotService,
    createReplacement: () => ({ replaceAll: unexpected }),
    createSnapshotReader: () => ({ readConsistentSnapshot: unexpected }),
    estimateStorage: async () => ({ quota: 10_000_000, usage: 0 }),
    getBootstrap: () => bootstrap,
    getOperationGate: createReadyPersistenceOperationGateStub,
    idGenerator: { generate: () => 'unused-id' },
    readUserSettings: unexpected,
    writeUserSettings: unexpected,
  }
  return {
    bootstrap,
    listAvailable,
    runtime: getOptionsBackupRecoveryRuntime(deps),
    summary,
  }
}

describe('optionsBackupRecovery composition', () => {
  beforeEach(() => {
    resetOptionsBackupRecoveryRuntimeForTesting()
  })

  it('lists IndexedDB recovery snapshots without migration state', async () => {
    const { bootstrap, listAvailable, runtime, summary } =
      createRecoveryListing()
    await expect(runtime.listRecoverySnapshots()).resolves.toEqual([summary])
    expect(bootstrap.ready).toHaveBeenCalledOnce()
    expect(listAvailable).toHaveBeenCalledExactlyOnceWith(1_000)
  })

  it('propagates an actual IndexedDB listing error after cutover', async () => {
    const { listAvailable, runtime } = createRecoveryListing()
    const error = new Error('IndexedDB read failed')
    listAvailable.mockRejectedValueOnce(error)
    await expect(runtime.listRecoverySnapshots()).rejects.toBe(error)
  })

  it('propagates bootstrap failure without querying recovery snapshots', async () => {
    const { bootstrap, listAvailable, runtime } = createRecoveryListing()
    const error = new PersistenceUnavailableError(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
    bootstrap.ready.mockRejectedValueOnce(error)
    await expect(runtime.listRecoverySnapshots()).rejects.toBe(error)
    expect(listAvailable).not.toHaveBeenCalled()
  })

  it('wires one lazy recovery-backed overwrite runtime and keeps rollback distinct from user restore', async () => {
    const close = vi.fn()
    const connectionManager = {
      close,
    } as unknown as IndexedDbConnectionManager
    const runIndexedDbWrite = vi.fn(
      async <T>(operation: () => Promise<T>): Promise<T> => operation(),
    )
    const operationGate = {
      runIndexedDbWrite,
    } as unknown as PersistenceOperationGatePort
    const snapshotReader = { readConsistentSnapshot: vi.fn() }
    const replacement = { replaceAll: vi.fn() }
    const repository = {} as PersistenceRecoverySnapshotRepositoryPort
    const notification = {
      event: {
        changeId: 'change-id',
        revision: 14,
        scopes: ['recoverySnapshots'] as const,
      },
      kind: 'committed_and_published' as const,
    }
    const captureResult = {
      id: 'recovery-id',
      notification,
      revision: 14,
    }
    const recoveryService: RecoverySnapshotService = {
      captureBeforeOverwrite: vi.fn(async () => captureResult),
      listAvailable: vi.fn(async () => []),
      restore: vi.fn(async () => ({ notification, revision: 14 })),
    }
    const importBackupV2 = vi.fn(async () => ({
      entityCounts: {
        analyticsViews: 0,
        categories: 0,
        collections: 0,
        conversations: 0,
        groups: 0,
        memberships: 0,
        messages: 0,
        urls: 0,
      },
      revision: 14,
    })) satisfies ImportBackupV2UseCase
    let importUseCaseDeps: ImportBackupV2UseCaseDeps | undefined
    const createImportUseCase = vi.fn((deps: ImportBackupV2UseCaseDeps) => {
      importUseCaseDeps = deps
      return importBackupV2
    })
    const createRecoveryService = vi.fn(
      (_deps: PreImportRecoverySnapshotServiceDeps) => recoveryService,
    )
    const deps = {
      changePort: {
        publish: vi.fn(),
        subscribe: vi.fn(),
      },
      clock: { now: vi.fn(() => 1_000) },
      createConnectionManager: vi.fn(() => connectionManager),
      createImportUseCase,
      createRecoveryRepository: vi.fn(() => repository),
      createRecoveryService,
      createReplacement: vi.fn(() => replacement),
      createSnapshotReader: vi.fn(() => snapshotReader),
      estimateStorage: vi.fn(),
      getBootstrap: () => ({
        ready: async () => undefined,
      }),
      getOperationGate: vi.fn(() => operationGate),
      idGenerator: { generate: vi.fn(() => 'generated-id') },
      readUserSettings: vi.fn(),
      writeUserSettings: vi.fn(),
    }

    const first = getOptionsBackupRecoveryRuntime(deps)
    const second = getOptionsBackupRecoveryRuntime(deps)

    expect(second).toBe(first)
    expect(deps.createConnectionManager).toHaveBeenCalledOnce()
    expect(deps.createRecoveryRepository).toHaveBeenCalledWith(
      connectionManager,
      operationGate,
    )
    expect(createRecoveryService).toHaveBeenCalledWith({
      changePort: deps.changePort,
      clock: deps.clock,
      estimateStorage: deps.estimateStorage,
      idGenerator: deps.idGenerator,
      readUserSettings: deps.readUserSettings,
      replacement,
      repository,
      snapshotReader,
      writeUserSettings: expect.any(Function),
    })
    expect(createImportUseCase).toHaveBeenCalledWith({
      readUserSettings: deps.readUserSettings,
      recovery: {
        captureBeforeOverwrite: recoveryService.captureBeforeOverwrite,
        restore: expect.any(Function),
      },
      replacement,
      snapshotReader,
      writeUserSettings: expect.any(Function),
    })

    const guardedSettingsWriter =
      createRecoveryService.mock.calls[0]?.[0].writeUserSettings
    expect(importUseCaseDeps?.writeUserSettings).toBe(guardedSettingsWriter)
    const settings = {} as Parameters<
      ImportBackupV2UseCaseDeps['writeUserSettings']
    >[0]
    await guardedSettingsWriter?.(settings)
    expect(runIndexedDbWrite).toHaveBeenCalledOnce()
    expect(deps.writeUserSettings).toHaveBeenCalledWith(settings)

    const inspection = {} as Parameters<ImportBackupV2UseCase>[0]
    await first.importBackupV2(inspection)
    expect(importBackupV2).toHaveBeenCalledWith(inspection)

    const rollback = importUseCaseDeps?.recovery
    await rollback?.restore(captureResult)
    expect(recoveryService.restore).toHaveBeenLastCalledWith('recovery-id')

    await first.restoreRecoverySnapshot('recovery-id')
    expect(recoveryService.restore).toHaveBeenLastCalledWith('recovery-id', {
      captureCurrent: true,
    })
    expect(runIndexedDbWrite).toHaveBeenCalledOnce()
    await expect(first.listRecoverySnapshots()).resolves.toEqual([])

    resetOptionsBackupRecoveryRuntimeForTesting()
    expect(close).toHaveBeenCalledOnce()
  })
})

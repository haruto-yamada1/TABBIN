import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceRecoverySnapshotRepositoryPort } from '@/contexts/saved-tabs/application/ports/PersistenceRecoverySnapshotPort'
import type { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import type {
  ImportBackupV2UseCase,
  ImportBackupV2UseCaseDeps,
} from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import type { RecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'

import {
  getOptionsBackupRecoveryRuntime,
  resetOptionsBackupRecoveryRuntimeForTesting,
} from './optionsBackupRecovery'

describe('optionsBackupRecovery composition', () => {
  beforeEach(() => {
    resetOptionsBackupRecoveryRuntimeForTesting()
  })

  it('wires one lazy recovery-backed overwrite runtime and keeps rollback distinct from user restore', async () => {
    const close = vi.fn()
    const connectionManager = {
      close,
    } as unknown as IndexedDbConnectionManager
    const operationGate = {} as PersistenceOperationGatePort
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
    const createRecoveryService = vi.fn(() => recoveryService)
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
      writeUserSettings: deps.writeUserSettings,
    })
    expect(createImportUseCase).toHaveBeenCalledWith({
      readUserSettings: deps.readUserSettings,
      recovery: {
        captureBeforeOverwrite: recoveryService.captureBeforeOverwrite,
        restore: expect.any(Function),
      },
      replacement,
      snapshotReader,
      writeUserSettings: deps.writeUserSettings,
    })

    const rollback = importUseCaseDeps?.recovery
    await rollback?.restore(captureResult)
    expect(recoveryService.restore).toHaveBeenLastCalledWith('recovery-id')

    await first.restoreRecoverySnapshot('recovery-id')
    expect(recoveryService.restore).toHaveBeenLastCalledWith('recovery-id', {
      captureCurrent: true,
    })
    await expect(first.listRecoverySnapshots()).resolves.toEqual([])

    resetOptionsBackupRecoveryRuntimeForTesting()
    expect(close).toHaveBeenCalledOnce()
  })
})

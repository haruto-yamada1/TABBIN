import { getPersistenceRecoveryController } from '@/app/composition/createPersistenceRecoveryController'
import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2UnitOfWorkPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import {
  checkPersistenceIntegrity,
  hasBlockingPersistenceIntegrityIssues,
} from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { createImportLegacyBackupMergeUseCase } from '@/features/options/lib/import-export/legacy/ImportLegacyBackupMergeUseCase'
import type {
  LegacyBackupMergeInput,
  LegacyBackupMergeResult,
} from '@/features/options/lib/import-export/legacy/ImportLegacyBackupMergeUseCase'
import {
  readUserSettingsWithoutRepair,
  saveUserSettings,
} from '@/lib/storage/settings'

export type OptionsLegacyBackupMergeRuntime = {
  readonly mergeLegacyBackup: (
    input: LegacyBackupMergeInput,
  ) => Promise<LegacyBackupMergeResult>
}

export type OptionsLegacyBackupMergeRuntimeDeps = {
  readonly clearRecovery: () => void
  readonly createConnectionManager: () => IndexedDbConnectionManager
  readonly createUnitOfWork: (
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) => PersistenceV2UnitOfWorkPort
  readonly getOperationGate: () => PersistenceOperationGatePort
  readonly readUserSettings: typeof readUserSettingsWithoutRepair
  readonly recoverLegacyRoute: () => Promise<void>
  readonly writeUserSettings: typeof saveUserSettings
}

type ManagedOptionsLegacyBackupMergeRuntime =
  OptionsLegacyBackupMergeRuntime & {
    readonly close: () => void
  }

const defaultDeps: OptionsLegacyBackupMergeRuntimeDeps = {
  clearRecovery: () => {
    getPersistenceRecoveryController().clear()
  },
  createConnectionManager: () => new IndexedDbConnectionManager(),
  createUnitOfWork: (connectionManager, operationGate) =>
    new IndexedDbPersistenceUnitOfWork(connectionManager, operationGate),
  getOperationGate: () => getPersistenceBootstrapRuntime().operationGate,
  readUserSettings: readUserSettingsWithoutRepair,
  recoverLegacyRoute: async () =>
    getPersistenceRecoveryController().rerunPreflightAndRetry(),
  writeUserSettings: saveUserSettings,
}

const createRuntime = (
  deps: OptionsLegacyBackupMergeRuntimeDeps,
): ManagedOptionsLegacyBackupMergeRuntime => {
  const connectionManager = deps.createConnectionManager()
  const operationGate = deps.getOperationGate()
  const unitOfWork = deps.createUnitOfWork(connectionManager, operationGate)
  const snapshotReader = new IndexedDbPersistenceSnapshotReader(
    connectionManager,
    operationGate,
  )
  const writeUserSettings = async (
    settings: Parameters<typeof saveUserSettings>[0],
  ) =>
    operationGate.runIndexedDbWrite(async () =>
      deps.writeUserSettings(settings),
    )
  const mergeLegacyBackupOnce = createImportLegacyBackupMergeUseCase({
    commit: unitOfWork.commit.bind(unitOfWork),
    hasBlockingSavedTabsIssues: (savedTabs) =>
      hasBlockingPersistenceIntegrityIssues(
        checkPersistenceIntegrity(savedTabs),
      ),
    readSnapshot: snapshotReader.readConsistentSnapshot.bind(snapshotReader),
    readUserSettings: deps.readUserSettings,
    writeUserSettings,
  })
  const mergeLegacyBackup = async (
    input: LegacyBackupMergeInput,
  ): Promise<LegacyBackupMergeResult> => {
    try {
      return await mergeLegacyBackupOnce(input)
    } catch (error) {
      if (
        !(error instanceof PersistenceUnavailableError) ||
        error.code !== 'PERSISTENCE_ROUTE_MISMATCH'
      ) {
        throw error
      }
      await deps.recoverLegacyRoute()
      const result = await mergeLegacyBackupOnce(input)
      deps.clearRecovery()
      return result
    }
  }
  return {
    close: () => {
      connectionManager.close()
    },
    mergeLegacyBackup,
  }
}

let runtime: ManagedOptionsLegacyBackupMergeRuntime | undefined

export const getOptionsLegacyBackupMergeRuntime = (
  deps?: OptionsLegacyBackupMergeRuntimeDeps,
): OptionsLegacyBackupMergeRuntime => {
  if (deps !== undefined) {
    runtime?.close()
    runtime = createRuntime(deps)
    return runtime
  }
  runtime ??= createRuntime(defaultDeps)
  return runtime
}

export const mergeLegacyBackupIntoIndexedDb = async (
  input: LegacyBackupMergeInput,
): Promise<LegacyBackupMergeResult> =>
  getOptionsLegacyBackupMergeRuntime().mergeLegacyBackup(input)

export const resetOptionsLegacyBackupMergeRuntimeForTesting = (): void => {
  runtime?.close()
  runtime = undefined
}

import { getAppVersion } from '@/constants/app-version'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import type {
  ExportBackupV2UseCase,
  ExportBackupV2UseCaseDeps,
} from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { readUserSettingsWithoutRepair } from '@/lib/storage/settings'

import { getMigrationPreflightController } from './createMigrationPreflightController'

export type OptionsBackupV2ExportRuntime = {
  readonly exportBackupV2: ExportBackupV2UseCase
}

export type OptionsBackupV2ExportRuntimeDeps = {
  readonly createConnectionManager: () => IndexedDbConnectionManager
  readonly createExportUseCase: (
    deps: ExportBackupV2UseCaseDeps,
  ) => ExportBackupV2UseCase
  readonly createSnapshotReader: (
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) => ExportBackupV2UseCaseDeps['snapshotReader']
  readonly getAppVersion: () => string
  readonly getOperationGate: () => PersistenceOperationGatePort
  readonly now: () => Date
  readonly preparePersistence: () => Promise<void>
  readonly readUserSettings: ExportBackupV2UseCaseDeps['readUserSettings']
}

type ManagedOptionsBackupV2ExportRuntime = OptionsBackupV2ExportRuntime & {
  readonly close: () => void
}

const defaultDeps: OptionsBackupV2ExportRuntimeDeps = {
  createConnectionManager: () => new IndexedDbConnectionManager(),
  createExportUseCase: createExportBackupV2UseCase,
  createSnapshotReader: (connectionManager, operationGate) =>
    new IndexedDbPersistenceSnapshotReader(connectionManager, operationGate),
  getAppVersion,
  getOperationGate: () => getPersistenceBootstrapRuntime().operationGate,
  now: () => new Date(),
  preparePersistence: async () => getMigrationPreflightController().run(),
  readUserSettings: readUserSettingsWithoutRepair,
}

const createRuntime = (
  deps: OptionsBackupV2ExportRuntimeDeps,
): ManagedOptionsBackupV2ExportRuntime => {
  const connectionManager = deps.createConnectionManager()
  const snapshotReader = deps.createSnapshotReader(
    connectionManager,
    deps.getOperationGate(),
  )
  const exportBackupV2UseCase = deps.createExportUseCase({
    getAppVersion: deps.getAppVersion,
    now: deps.now,
    readUserSettings: deps.readUserSettings,
    snapshotReader,
  })
  const exportBackupV2 = async (): ReturnType<ExportBackupV2UseCase> => {
    await deps.preparePersistence()
    return exportBackupV2UseCase()
  }

  return {
    close: () => {
      connectionManager.close()
    },
    exportBackupV2,
  }
}

let runtime: ManagedOptionsBackupV2ExportRuntime | undefined

export const getOptionsBackupV2ExportRuntime = (
  deps: OptionsBackupV2ExportRuntimeDeps = defaultDeps,
): OptionsBackupV2ExportRuntime => {
  runtime ??= createRuntime(deps)
  return runtime
}

export const exportBackupV2 = async (): ReturnType<ExportBackupV2UseCase> =>
  getOptionsBackupV2ExportRuntime().exportBackupV2()

export const resetOptionsBackupV2ExportRuntimeForTesting = (): void => {
  runtime?.close()
  runtime = undefined
}

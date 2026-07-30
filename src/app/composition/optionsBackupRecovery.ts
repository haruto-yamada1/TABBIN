import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemClock } from '@/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import type {
  ClockPort,
  IdGeneratorPort,
  PersistenceChangePort,
  PersistenceRecoverySnapshotRepositoryPort,
  PersistenceRecoverySnapshotSummary,
  PersistenceV2ReplacementPort,
} from '@/contexts/saved-tabs/public-api'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import type {
  ImportBackupV2UseCase,
  ImportBackupV2UseCaseDeps,
} from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import type {
  PreImportRecoverySnapshotServiceDeps,
  RecoverySnapshotRestoreResult,
  RecoverySnapshotService,
} from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import type { PersistenceStorageEstimatePort } from '@/lib/persistence/capacity'
import { getUserSettings, saveUserSettings } from '@/lib/storage/settings'

export type OptionsBackupRecoveryRuntime = {
  readonly importBackupV2: ImportBackupV2UseCase
  readonly listRecoverySnapshots: () => Promise<
    readonly PersistenceRecoverySnapshotSummary[]
  >
  readonly restoreRecoverySnapshot: (
    id: string,
  ) => Promise<RecoverySnapshotRestoreResult>
}

export type OptionsBackupRecoveryRuntimeDeps = {
  readonly changePort: PersistenceChangePort
  readonly clock: ClockPort
  readonly createConnectionManager: () => IndexedDbConnectionManager
  readonly createImportUseCase: (
    deps: ImportBackupV2UseCaseDeps,
  ) => ImportBackupV2UseCase
  readonly createRecoveryRepository: (
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) => PersistenceRecoverySnapshotRepositoryPort
  readonly createRecoveryService: (
    deps: PreImportRecoverySnapshotServiceDeps,
  ) => RecoverySnapshotService
  readonly createReplacement: (
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) => PersistenceV2ReplacementPort
  readonly createSnapshotReader: (
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) => ImportBackupV2UseCaseDeps['snapshotReader']
  readonly estimateStorage: PersistenceStorageEstimatePort
  readonly getOperationGate: () => PersistenceOperationGatePort
  readonly idGenerator: IdGeneratorPort
  readonly readUserSettings: ImportBackupV2UseCaseDeps['readUserSettings']
  readonly writeUserSettings: ImportBackupV2UseCaseDeps['writeUserSettings']
}

type ManagedOptionsBackupRecoveryRuntime = OptionsBackupRecoveryRuntime & {
  readonly close: () => void
}

type NavigatorWithStorageEstimate = {
  readonly storage: {
    readonly estimate: PersistenceStorageEstimatePort
  }
}

const hasStorageEstimate = (
  value: unknown,
): value is NavigatorWithStorageEstimate => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('storage' in value) ||
    typeof value.storage !== 'object' ||
    value.storage === null ||
    !('estimate' in value.storage)
  ) {
    return false
  }
  return typeof value.storage.estimate === 'function'
}

const estimateBrowserStorage: PersistenceStorageEstimatePort = async () => {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  if (!hasStorageEstimate(navigatorValue)) {
    throw new Error('Browser storage estimation is unavailable.')
  }
  const estimate = await navigatorValue.storage.estimate()
  return estimate
}

const getRecoverySnapshotId = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id
  }
  throw new TypeError('Recovery snapshot identifier must be available.')
}

const defaultDeps: OptionsBackupRecoveryRuntimeDeps = {
  changePort: createBroadcastChannelPersistenceChangeAdapter(),
  clock: createSystemClock(),
  createConnectionManager: () => new IndexedDbConnectionManager(),
  createImportUseCase: createImportBackupV2UseCase,
  createRecoveryRepository: (connectionManager, operationGate) =>
    new IndexedDbPersistenceRecoverySnapshotRepository(
      connectionManager,
      operationGate,
    ),
  createRecoveryService: createPreImportRecoverySnapshotService,
  createReplacement: (connectionManager, operationGate) =>
    new IndexedDbPersistenceReplacementAdapter(
      connectionManager,
      operationGate,
    ),
  createSnapshotReader: (connectionManager, operationGate) =>
    new IndexedDbPersistenceSnapshotReader(connectionManager, operationGate),
  estimateStorage: estimateBrowserStorage,
  getOperationGate: () => getPersistenceBootstrapRuntime().operationGate,
  idGenerator: createSystemIdGenerator(),
  readUserSettings: getUserSettings,
  writeUserSettings: saveUserSettings,
}

const createRuntime = (
  deps: OptionsBackupRecoveryRuntimeDeps,
): ManagedOptionsBackupRecoveryRuntime => {
  const connectionManager = deps.createConnectionManager()
  const operationGate = deps.getOperationGate()
  const snapshotReader = deps.createSnapshotReader(
    connectionManager,
    operationGate,
  )
  const replacement = deps.createReplacement(connectionManager, operationGate)
  const repository = deps.createRecoveryRepository(
    connectionManager,
    operationGate,
  )
  const recoveryService = deps.createRecoveryService({
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
  const importBackupV2 = deps.createImportUseCase({
    readUserSettings: deps.readUserSettings,
    recovery: {
      captureBeforeOverwrite: recoveryService.captureBeforeOverwrite,
      restore: async (recoveryId) => {
        await recoveryService.restore(getRecoverySnapshotId(recoveryId))
      },
    },
    replacement,
    snapshotReader,
    writeUserSettings: deps.writeUserSettings,
  })

  return {
    close: () => {
      connectionManager.close()
    },
    importBackupV2,
    listRecoverySnapshots: recoveryService.listAvailable,
    restoreRecoverySnapshot: async (id) =>
      recoveryService.restore(id, { captureCurrent: true }),
  }
}

let runtime: ManagedOptionsBackupRecoveryRuntime | undefined

export const getOptionsBackupRecoveryRuntime = (
  deps: OptionsBackupRecoveryRuntimeDeps = defaultDeps,
): OptionsBackupRecoveryRuntime => {
  runtime ??= createRuntime(deps)
  return runtime
}

export const importBackupV2WithRecovery: ImportBackupV2UseCase = async (
  inspection,
) => getOptionsBackupRecoveryRuntime().importBackupV2(inspection)

export const listBackupRecoverySnapshots = async (): Promise<
  readonly PersistenceRecoverySnapshotSummary[]
> => getOptionsBackupRecoveryRuntime().listRecoverySnapshots()

export const restoreBackupRecoverySnapshot = async (
  id: string,
): Promise<RecoverySnapshotRestoreResult> =>
  getOptionsBackupRecoveryRuntime().restoreRecoverySnapshot(id)

export const resetOptionsBackupRecoveryRuntimeForTesting = (): void => {
  runtime?.close()
  runtime = undefined
}

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapRecoveryControllerPort,
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateAccessPort,
  PersistenceControlStateRepositoryPort,
  PersistenceControlStateTransition,
  PersistenceCoordinationPort,
  PersistenceDataPlaneRouterPort,
  PersistenceMigrationLifecyclePort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceMigrationRecoveryLifecyclePort } from '@/contexts/saved-tabs/application/ports/PersistenceMigrationRecoveryPort'
import { PersistenceBootstrapService } from '@/contexts/saved-tabs/application/services/PersistenceBootstrapService'
import { transitionPersistenceControlState } from '@/contexts/saved-tabs/application/services/PersistenceControlStateService'
import { PersistenceDataPlaneRouterService } from '@/contexts/saved-tabs/application/services/PersistenceDataPlaneRouterService'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { PersistenceRecoveryService } from '@/contexts/saved-tabs/application/services/PersistenceRecoveryService'
import { PersistenceV2MigrationService } from '@/contexts/saved-tabs/application/services/PersistenceV2MigrationService'
import { WebLocksPersistenceCoordinationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter'
import { ChromeRawLegacyStorageReader } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeRawLegacyStorageReader'
import { ChromeMigrationPreflightReader } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromeMigrationPreflightRepository'
import { ChromePersistenceControlStateRepository } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository'
import { Sha256MigrationSourceFingerprint } from '@/contexts/saved-tabs/infrastructure/persistence/fingerprint/Sha256MigrationSourceFingerprint'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceMigrationTarget } from '@/contexts/saved-tabs/infrastructure/persistence/migrations/IndexedDbPersistenceMigrationTarget'
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export type PersistenceBootstrapRuntime = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly connectionManager?: IndexedDbConnectionManager
  readonly coordination: PersistenceCoordinationPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly dataPlaneRouter: PersistenceDataPlaneRouterPort
  readonly migrationLifecycle?: PersistenceMigrationLifecyclePort
  readonly migrationRecovery?: PersistenceMigrationRecoveryLifecyclePort
  readonly operationGate: PersistenceOperationGatePort
  readonly recovery: PersistenceBootstrapRecoveryControllerPort
}

export type PersistenceV2MigrationStorage = {
  readonly get: (
    keys: string | readonly string[],
  ) => Promise<Record<string, unknown>>
}

export type PersistenceV2MigrationLifecycleOptions = {
  readonly batchSize?: number
  readonly connectionManager?: IndexedDbConnectionManager
  readonly indexedDb?: IDBFactory
  readonly storage: PersistenceV2MigrationStorage
}

export const createPersistenceV2MigrationLifecycle = (
  options: PersistenceV2MigrationLifecycleOptions,
): PersistenceMigrationRecoveryLifecyclePort => {
  const rawReader = new ChromeRawLegacyStorageReader({
    get: async (keys) => options.storage.get(keys),
  })
  const preflightRepository = new ChromeMigrationPreflightReader({
    get: async (key) => options.storage.get(key),
  })
  const target = new IndexedDbPersistenceMigrationTarget(
    options.connectionManager ??
      new IndexedDbConnectionManager(
        options.indexedDb !== undefined ? { indexedDb: options.indexedDb } : {},
      ),
  )
  return new PersistenceV2MigrationService({
    ...(options.batchSize !== undefined
      ? { batchSize: options.batchSize }
      : {}),
    fingerprint: new Sha256MigrationSourceFingerprint(),
    preflightRepository,
    rawReader,
    target,
  })
}

export type PersistenceStorageLocal = {
  readonly clear: () => Promise<void>
  readonly get: <T = Record<string, unknown>>(
    keys?: NoInfer<keyof T> | NoInfer<keyof T>[] | Partial<NoInfer<T>> | null,
  ) => Promise<T>
  readonly getBytesInUse: <T = Record<string, unknown>>(
    keys?: keyof T | (keyof T)[] | null,
  ) => Promise<number>
  readonly getKeys: () => Promise<string[]>
  readonly remove: <T = Record<string, unknown>>(
    keys: keyof T | (keyof T)[],
  ) => Promise<void>
  readonly set: <T = Record<string, unknown>>(
    items: Partial<T>,
  ) => Promise<void>
}

export type SavedTabsDomainStorageLocal = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly remove: (key: string) => Promise<void>
  readonly set: (value: Record<string, unknown>) => Promise<void>
}

export const createGatedPersistenceStorageLocal = (
  storage: typeof chrome.storage.local,
  operationGate: PersistenceOperationGatePort,
): PersistenceStorageLocal => ({
  clear: async () => operationGate.runLegacyWrite(async () => storage.clear()),
  get: async <T = Record<string, unknown>>(
    keys?: NoInfer<keyof T> | NoInfer<keyof T>[] | Partial<NoInfer<T>> | null,
  ): Promise<T> =>
    operationGate.runLegacyRead(async () => storage.get<T>(keys)),
  getBytesInUse: async <T = Record<string, unknown>>(
    keys?: keyof T | (keyof T)[] | null,
  ): Promise<number> =>
    operationGate.runLegacyRead(async () => storage.getBytesInUse<T>(keys)),
  getKeys: async (): Promise<string[]> =>
    operationGate.runLegacyRead(async () => storage.getKeys()),
  remove: async <T = Record<string, unknown>>(
    keys: keyof T | (keyof T)[],
  ): Promise<void> =>
    operationGate.runLegacyWrite(async () => storage.remove<T>(keys)),
  set: async <T = Record<string, unknown>>(items: Partial<T>): Promise<void> =>
    operationGate.runLegacyWrite(async () => storage.set<T>(items)),
})

class TestPersistenceControlStateRepository implements PersistenceControlStateRepositoryPort {
  private state: PersistenceControlState = { status: 'legacy' }

  readonly read = async (): Promise<PersistenceControlState> => {
    const state = await Promise.resolve(this.state)
    return state
  }

  readonly transition = async (
    transition: PersistenceControlStateTransition,
  ): Promise<PersistenceControlState> => {
    const current = await this.read()
    this.state = transitionPersistenceControlState(current, transition)
    return this.state
  }
}

class TestPersistenceCoordinationAdapter implements PersistenceCoordinationPort {
  private tail: Promise<void> = Promise.resolve()

  readonly runExclusive = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = await this.enqueue(operation)
    return result
  }

  readonly runShared = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = await this.enqueue(operation)
    return result
  }

  private readonly enqueue = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    const settled = await result
    return settled
  }
}

type ChromeManifestApi = {
  readonly runtime: {
    readonly getManifest: () => unknown
  }
}

const isChromeManifestApi = (value: unknown): value is ChromeManifestApi => {
  if (!isObjectLike(value)) {
    return false
  }
  const runtime: unknown = Reflect.get(value, 'runtime')
  return (
    isObjectLike(runtime) &&
    typeof Reflect.get(runtime, 'getManifest') === 'function'
  )
}

const getRuntimeManifest = (): unknown =>
  getChromeGlobal(isChromeManifestApi)?.runtime.getManifest()

const getNavigatorLocks = (): unknown => {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  return isObjectLike(navigatorValue)
    ? Reflect.get(navigatorValue, 'locks')
    : undefined
}

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  isObjectLike(value) && !Array.isArray(value)

const isTestEnvironment = (): boolean => import.meta.env.MODE === 'test'

const isMigrationRecoveryLifecycle = (
  lifecycle: PersistenceMigrationLifecyclePort | undefined,
): lifecycle is PersistenceMigrationRecoveryLifecyclePort =>
  lifecycle !== undefined &&
  'readFailureDiagnostic' in lifecycle &&
  typeof lifecycle.readFailureDiagnostic === 'function' &&
  'readReport' in lifecycle &&
  typeof lifecycle.readReport === 'function'

// eslint-disable-next-line max-params -- public composition seam retained for existing bootstrap callers
export const createPersistenceBootstrapRuntime = (
  access: PersistenceControlStateAccessPort,
  controlStateRepository: PersistenceControlStateRepositoryPort,
  coordination: PersistenceCoordinationPort,
  migrationLifecycle?: PersistenceMigrationLifecyclePort,
  connectionManager?: IndexedDbConnectionManager,
): PersistenceBootstrapRuntime => {
  const bootstrap = new PersistenceBootstrapService({
    access,
    controlStateRepository,
    coordination,
    cutoverPolicy: 'complete',
    ...(migrationLifecycle !== undefined ? { migrationLifecycle } : {}),
  })
  const migrationRecovery = isMigrationRecoveryLifecycle(migrationLifecycle)
    ? migrationLifecycle
    : undefined
  const recovery = new PersistenceRecoveryService({
    ...(migrationRecovery
      ? {
          readDiagnostic: migrationRecovery.readFailureDiagnostic,
        }
      : {}),
    retry: async () => bootstrap.ready(),
  })
  const operationGate = new PersistenceOperationGateService({
    bootstrap,
    controlStateRepository,
    coordination,
    recovery,
  })
  const dataPlaneRouter = new PersistenceDataPlaneRouterService({
    bootstrap,
    controlStateRepository,
    coordination,
    recovery,
  })
  return {
    bootstrap,
    ...(connectionManager !== undefined ? { connectionManager } : {}),
    coordination,
    controlStateRepository,
    dataPlaneRouter,
    ...(migrationLifecycle !== undefined ? { migrationLifecycle } : {}),
    ...(migrationRecovery !== undefined ? { migrationRecovery } : {}),
    operationGate,
    recovery,
  }
}

const createDefaultRuntime = (): PersistenceBootstrapRuntime => {
  if (isTestEnvironment()) {
    return createPersistenceBootstrapRuntime(
      {
        initialize: async () => {
          await Promise.resolve()
        },
      },
      new TestPersistenceControlStateRepository(),
      new TestPersistenceCoordinationAdapter(),
    )
  }

  const controlStateRepository = new ChromePersistenceControlStateRepository({
    getManifest: getRuntimeManifest,
    getStorageLocal: getChromeStorageLocal,
  })
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new PersistenceUnavailableError(
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  }
  const connectionManager = new IndexedDbConnectionManager()
  const migrationLifecycle = createPersistenceV2MigrationLifecycle({
    connectionManager,
    storage: {
      get: async (keys) => {
        const selected = typeof keys === 'string' ? keys : [...keys]
        const result: unknown = await storage.get(selected)
        if (!isUnknownRecord(result)) {
          throw new Error('chrome.storage.local returned an invalid result.')
        }
        return result
      },
    },
  })
  return createPersistenceBootstrapRuntime(
    controlStateRepository,
    controlStateRepository,
    new WebLocksPersistenceCoordinationAdapter({
      getLockManager: getNavigatorLocks,
    }),
    migrationLifecycle,
    connectionManager,
  )
}

let runtime: PersistenceBootstrapRuntime | undefined

export const getPersistenceBootstrapRuntime =
  (): PersistenceBootstrapRuntime => {
    runtime ??= createDefaultRuntime()
    return runtime
  }

export const getPersistenceStorageLocal =
  (): PersistenceStorageLocal | null => {
    const storage = getChromeStorageLocal()
    if (!storage) {
      return null
    }
    return createGatedPersistenceStorageLocal(
      storage,
      getPersistenceBootstrapRuntime().operationGate,
    )
  }

export const getRequiredPersistenceStorageLocal =
  (): PersistenceStorageLocal => {
    const storage = getPersistenceStorageLocal()
    if (!storage) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
      )
    }
    return storage
  }

export const resetPersistenceBootstrapRuntimeForTesting = (): void => {
  runtime = undefined
}

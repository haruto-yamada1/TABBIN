import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateAccessPort,
  PersistenceControlStateRepositoryPort,
  PersistenceControlStateTransition,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
  PersistenceRecoveryControllerPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PersistenceBootstrapService } from '@/contexts/saved-tabs/application/services/PersistenceBootstrapService'
import { transitionPersistenceControlState } from '@/contexts/saved-tabs/application/services/PersistenceControlStateService'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { PersistenceRecoveryService } from '@/contexts/saved-tabs/application/services/PersistenceRecoveryService'
import { WebLocksPersistenceCoordinationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter'
import { ChromePersistenceControlStateRepository } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository'
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export type PersistenceBootstrapRuntime = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly operationGate: PersistenceOperationGatePort
  readonly recovery: PersistenceRecoveryControllerPort
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

const isTestEnvironment = (): boolean => import.meta.env.MODE === 'test'

export const createPersistenceBootstrapRuntime = (
  access: PersistenceControlStateAccessPort,
  controlStateRepository: PersistenceControlStateRepositoryPort,
  coordination: PersistenceCoordinationPort,
): PersistenceBootstrapRuntime => {
  const bootstrap = new PersistenceBootstrapService({
    access,
    controlStateRepository,
    coordination,
  })
  const recovery = new PersistenceRecoveryService({
    retry: async () => bootstrap.ready(),
  })
  const operationGate = new PersistenceOperationGateService({
    bootstrap,
    controlStateRepository,
    coordination,
    recovery,
  })
  return { bootstrap, controlStateRepository, operationGate, recovery }
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
  return createPersistenceBootstrapRuntime(
    controlStateRepository,
    controlStateRepository,
    new WebLocksPersistenceCoordinationAdapter({
      getLockManager: getNavigatorLocks,
    }),
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

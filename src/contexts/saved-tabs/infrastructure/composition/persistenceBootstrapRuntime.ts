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

const READ_METHODS = new Set<PropertyKey>(['get', 'getBytesInUse', 'getKeys'])
const WRITE_METHODS = new Set<PropertyKey>(['clear', 'remove', 'set'])

export const createGatedPersistenceStorageLocal = <Storage extends object>(
  storage: Storage,
  operationGate: PersistenceOperationGatePort,
): Storage =>
  new Proxy(storage, {
    get: (target, property, receiver): unknown => {
      const value: unknown = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') {
        return value
      }

      const invoke = async (
        ...arguments_: readonly unknown[]
      ): Promise<unknown> => {
        const applied: unknown = Reflect.apply(value, target, arguments_)
        const result: unknown = await Promise.resolve(applied)
        return result
      }
      if (READ_METHODS.has(property)) {
        return async (...arguments_: readonly unknown[]) => {
          const result = await operationGate.runLegacyRead(async () => {
            const value = await invoke(...arguments_)
            return value
          })
          return result
        }
      }
      if (WRITE_METHODS.has(property)) {
        return async (...arguments_: readonly unknown[]) => {
          const result = await operationGate.runLegacyWrite(async () => {
            const value = await invoke(...arguments_)
            return value
          })
          return result
        }
      }
      return value.bind(target)
    },
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

export const getPersistenceStorageLocal = ():
  | typeof chrome.storage.local
  | null => {
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
  (): typeof chrome.storage.local => {
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

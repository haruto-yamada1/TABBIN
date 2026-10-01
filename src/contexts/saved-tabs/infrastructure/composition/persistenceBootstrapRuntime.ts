import type {
  PersistenceBootstrapPort,
  PersistenceBootstrapRecoveryControllerPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PersistenceBootstrapService } from '@/contexts/saved-tabs/application/services/PersistenceBootstrapService'
import { PersistenceOperationGateService } from '@/contexts/saved-tabs/application/services/PersistenceOperationGateService'
import { PersistenceRecoveryService } from '@/contexts/saved-tabs/application/services/PersistenceRecoveryService'
import { WebLocksPersistenceCoordinationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { isObjectLike } from '@/lib/browser/chrome-global'

export type PersistenceBootstrapRuntime = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly connectionManager: IndexedDbConnectionManager
  readonly coordination: PersistenceCoordinationPort
  readonly operationGate: PersistenceOperationGatePort
  readonly recovery: PersistenceBootstrapRecoveryControllerPort
}

export type PersistenceBootstrapRuntimeOptions = {
  readonly connectionManager?: IndexedDbConnectionManager
  readonly coordination?: PersistenceCoordinationPort
}

const getNavigatorLocks = (): unknown => {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  return isObjectLike(navigatorValue)
    ? Reflect.get(navigatorValue, 'locks')
    : undefined
}

export const createPersistenceBootstrapRuntime = (
  options: PersistenceBootstrapRuntimeOptions = {},
): PersistenceBootstrapRuntime => {
  const connectionManager =
    options.connectionManager ?? new IndexedDbConnectionManager()
  const coordination =
    options.coordination ??
    new WebLocksPersistenceCoordinationAdapter({
      getLockManager: getNavigatorLocks,
    })
  const bootstrap = new PersistenceBootstrapService({
    initialize: async () => {
      await connectionManager.open()
    },
  })
  const recovery = new PersistenceRecoveryService({
    retry: async () => {
      connectionManager.close()
      await bootstrap.ready()
    },
  })
  const operationGate = new PersistenceOperationGateService({
    bootstrap,
    coordination,
    recovery,
  })
  return { bootstrap, connectionManager, coordination, operationGate, recovery }
}

let runtime: PersistenceBootstrapRuntime | undefined

export const getPersistenceBootstrapRuntime =
  (): PersistenceBootstrapRuntime => {
    runtime ??= createPersistenceBootstrapRuntime()
    return runtime
  }

export const resetPersistenceBootstrapRuntimeForTesting = (): void => {
  runtime?.connectionManager.close()
  runtime = undefined
}

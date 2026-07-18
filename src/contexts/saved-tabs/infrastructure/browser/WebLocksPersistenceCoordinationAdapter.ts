import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceCoordinationPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export const PERSISTENCE_COORDINATION_LOCK_NAME =
  'tabbin:persistence-migration-barrier:v2'

export type PersistenceLockManager = {
  readonly request: <Result>(
    name: string,
    options: { readonly mode: 'exclusive' | 'shared' },
    callback: () => Promise<Result>,
  ) => Promise<Result>
}

export type WebLocksPersistenceCoordinationAdapterOptions = {
  readonly getLockManager: () => unknown
}

const isPersistenceLockManager = (
  value: unknown,
): value is PersistenceLockManager =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'request') === 'function'

class PersistenceOperationExecutionError extends Error {
  readonly operationError: unknown

  constructor(operationError: unknown) {
    super('Persistence operation failed while holding the coordination lock.')
    this.name = 'PersistenceOperationExecutionError'
    this.operationError = operationError
  }
}

export class WebLocksPersistenceCoordinationAdapter implements PersistenceCoordinationPort {
  private readonly options: WebLocksPersistenceCoordinationAdapterOptions

  constructor(options: WebLocksPersistenceCoordinationAdapterOptions) {
    this.options = options
  }

  readonly runExclusive = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('exclusive', operation)

  readonly runShared = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('shared', operation)

  private readonly run = async <Result>(
    mode: 'exclusive' | 'shared',
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    let manager: unknown
    try {
      manager = this.options.getLockManager()
    } catch (error) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_COORDINATION_UNAVAILABLE',
        { cause: error },
      )
    }
    if (!isPersistenceLockManager(manager)) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_COORDINATION_UNAVAILABLE',
      )
    }

    try {
      return await manager.request(
        PERSISTENCE_COORDINATION_LOCK_NAME,
        { mode },
        async () => {
          try {
            return await operation()
          } catch (error) {
            throw new PersistenceOperationExecutionError(error)
          }
        },
      )
    } catch (error) {
      if (error instanceof PersistenceOperationExecutionError) {
        throw error.operationError
      }
      throw new PersistenceUnavailableError(
        'PERSISTENCE_COORDINATION_UNAVAILABLE',
        { cause: error },
      )
    }
  }
}

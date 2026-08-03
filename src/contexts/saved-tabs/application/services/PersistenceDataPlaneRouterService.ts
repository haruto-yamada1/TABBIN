import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceDataPlaneOperation,
  PersistenceDataPlaneRouterPort,
  PersistenceRecoveryReporterPort,
  PersistenceRoute,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export type PersistenceDataPlaneRouterServiceOptions = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly coordination: PersistenceCoordinationPort
  readonly recovery: PersistenceRecoveryReporterPort
}

/**
 * Selects one authoritative persistence backend for a complete operation.
 *
 * A selected backend error is returned unchanged. The service deliberately
 * has no retry on the other backend and never invokes both callbacks.
 */
export class PersistenceDataPlaneRouterService implements PersistenceDataPlaneRouterPort {
  private readonly options: PersistenceDataPlaneRouterServiceOptions

  constructor(options: PersistenceDataPlaneRouterServiceOptions) {
    this.options = options
  }

  readonly read = async <Result>(
    operation: PersistenceDataPlaneOperation<Result>,
  ): Promise<Result> => this.run(false, operation)

  readonly write = async <Result>(
    operation: PersistenceDataPlaneOperation<Result>,
  ): Promise<Result> => this.run(true, operation)

  private readonly run = async <Result>(
    isWrite: boolean,
    operation: PersistenceDataPlaneOperation<Result>,
  ): Promise<Result> => {
    try {
      await this.options.bootstrap.ready()
      return await this.options.coordination.runShared(async () => {
        const route = await this.resolveRoute(isWrite)
        return operation[route]()
      })
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        this.options.recovery.reportUnavailable(error.code)
      }
      throw error
    }
  }

  private readonly resolveRoute = async (
    isWrite: boolean,
  ): Promise<PersistenceRoute> => {
    const state = await this.options.controlStateRepository.read()
    switch (state.status) {
      case 'legacy':
      case 'indexeddb': {
        return state.status
      }
      case 'read-only-emergency': {
        if (isWrite) {
          throw new PersistenceUnavailableError('PERSISTENCE_READ_ONLY')
        }
        return state.readSource
      }
      case 'failed': {
        throw new PersistenceUnavailableError(state.errorCode)
      }
      case 'migrating':
      case 'verifying':
      case 'cutover-pending': {
        throw new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED')
      }
      default: {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_CONTROL_STATE_INVALID',
        )
      }
    }
  }
}

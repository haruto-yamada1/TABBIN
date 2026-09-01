import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
  PersistenceRecoveryReporterPort,
  PersistenceRoute,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export type PersistenceOperationGateServiceOptions = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly coordination: PersistenceCoordinationPort
  readonly recovery: PersistenceRecoveryReporterPort
}

export class PersistenceOperationGateService implements PersistenceOperationGatePort {
  private readonly options: PersistenceOperationGateServiceOptions

  constructor(options: PersistenceOperationGateServiceOptions) {
    this.options = options
  }

  readonly runIndexedDbRead = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('indexeddb', false, operation)

  readonly runIndexedDbWrite = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('indexeddb', true, operation)

  readonly runLegacyRead = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('legacy', false, operation)

  readonly runLegacyWrite = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run('legacy', true, operation)

  private readonly run = async <Result>(
    route: PersistenceRoute,
    isWrite: boolean,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    try {
      await this.options.bootstrap.ready()
      return await this.options.coordination.runShared(async () => {
        const state = await this.options.controlStateRepository.read()
        switch (state.status) {
          case 'legacy': {
            if (route !== 'legacy') {
              throw new PersistenceUnavailableError(
                'PERSISTENCE_ROUTE_MISMATCH',
              )
            }
            break
          }
          case 'indexeddb': {
            if (route !== 'indexeddb') {
              throw new PersistenceUnavailableError(
                'PERSISTENCE_ROUTE_MISMATCH',
              )
            }
            break
          }
          case 'read-only-emergency': {
            if (isWrite) {
              throw new PersistenceUnavailableError('PERSISTENCE_READ_ONLY')
            }
            if (state.readSource !== route) {
              throw new PersistenceUnavailableError(
                'PERSISTENCE_ROUTE_MISMATCH',
              )
            }
            break
          }
          case 'failed': {
            throw new PersistenceUnavailableError(state.errorCode)
          }
          case 'migrating':
          case 'verifying':
          case 'cutover-pending': {
            throw new PersistenceUnavailableError(
              'PERSISTENCE_RECOVERY_REQUIRED',
            )
          }
          default: {
            throw new PersistenceUnavailableError(
              'PERSISTENCE_CONTROL_STATE_INVALID',
            )
          }
        }
        return operation()
      })
    } catch (error) {
      if (
        error instanceof PersistenceUnavailableError &&
        (await this.shouldReportUnavailable(error, route, isWrite))
      ) {
        this.options.recovery.reportUnavailable(error.code)
      }
      throw error
    }
  }

  private readonly shouldReportUnavailable = async (
    error: PersistenceUnavailableError,
    route: PersistenceRoute,
    isWrite: boolean,
  ): Promise<boolean> => {
    if (error.code !== 'PERSISTENCE_ROUTE_MISMATCH') {
      return true
    }
    try {
      return !(await this.isRouteAuthorized(route, isWrite))
    } catch {
      // Preserve and report the original route failure when state cannot be re-read.
      return true
    }
  }

  private readonly isRouteAuthorized = async (
    route: PersistenceRoute,
    isWrite: boolean,
  ): Promise<boolean> =>
    this.options.coordination.runShared(async () => {
      const state = await this.options.controlStateRepository.read()
      switch (state.status) {
        case 'legacy': {
          return route === 'legacy'
        }
        case 'indexeddb': {
          return route === 'indexeddb'
        }
        case 'read-only-emergency': {
          return !isWrite && state.readSource === route
        }
        case 'cutover-pending':
        case 'failed':
        case 'migrating':
        case 'verifying': {
          return false
        }
        default: {
          return false
        }
      }
    })
}

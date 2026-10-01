import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceCoordinationPort,
  PersistenceOperationGatePort,
  PersistenceRecoveryReporterPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export type PersistenceOperationGateServiceOptions = {
  readonly bootstrap: PersistenceBootstrapPort
  readonly coordination: PersistenceCoordinationPort
  readonly recovery: PersistenceRecoveryReporterPort
}

/** Coordinates database operations with exclusive replacement/recovery work. */
export class PersistenceOperationGateService implements PersistenceOperationGatePort {
  private readonly options: PersistenceOperationGateServiceOptions

  constructor(options: PersistenceOperationGateServiceOptions) {
    this.options = options
  }

  readonly runIndexedDbRead = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run(operation)

  readonly runIndexedDbWrite = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => this.run(operation)

  private readonly run = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    try {
      await this.options.bootstrap.ready()
      return await this.options.coordination.runShared(operation)
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        this.options.recovery.reportUnavailable(error.code)
      }
      throw error
    }
  }
}

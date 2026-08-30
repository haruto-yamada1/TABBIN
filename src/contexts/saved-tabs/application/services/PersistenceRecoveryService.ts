import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapRecoveryControllerPort,
  PersistenceBootstrapErrorCode,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2MigrationDiagnostic } from '@/contexts/saved-tabs/application/ports/PersistenceRecoveryPort'

export type PersistenceRecoveryServiceOptions = {
  readonly readDiagnostic?: () => PersistenceV2MigrationDiagnostic | undefined
  readonly retry: () => Promise<void>
}

const AVAILABLE_STATE: PersistenceRecoveryState = { status: 'available' }

export class PersistenceRecoveryService implements PersistenceBootstrapRecoveryControllerPort {
  private readonly listeners = new Set<() => void>()
  private readonly options: PersistenceRecoveryServiceOptions
  private state: PersistenceRecoveryState = AVAILABLE_STATE

  constructor(options: PersistenceRecoveryServiceOptions) {
    this.options = options
  }

  readonly clear = (): void => {
    if (this.state.status === 'available') {
      return
    }
    this.state = AVAILABLE_STATE
    this.emit()
  }

  readonly getSnapshot = (): PersistenceRecoveryState => this.state

  readonly reportUnavailable = (
    errorCode: PersistenceBootstrapErrorCode,
    persistedDiagnostic?: PersistenceV2MigrationDiagnostic,
  ): void => {
    const diagnostic = persistedDiagnostic ?? this.options.readDiagnostic?.()
    if (
      this.state.status === 'unavailable' &&
      this.state.errorCode === errorCode &&
      this.state.diagnostic === diagnostic
    ) {
      return
    }
    this.state = {
      ...(diagnostic ? { diagnostic } : {}),
      status: 'unavailable',
      errorCode,
    }
    this.emit()
  }

  readonly retry = async (): Promise<void> => {
    try {
      await this.options.retry()
      this.clear()
    } catch (error) {
      this.retainFailure(error)
      throw error
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private readonly emit = (): void => {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private readonly retainFailure = (error: unknown): void => {
    if (error instanceof PersistenceUnavailableError) {
      this.reportUnavailable(error.code, error.diagnostic)
      return
    }
    this.reportUnavailable('PERSISTENCE_RECOVERY_REQUIRED')
  }
}

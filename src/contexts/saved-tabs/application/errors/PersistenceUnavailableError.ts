import type { PersistenceBootstrapErrorCode } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2MigrationDiagnostic } from '@/contexts/saved-tabs/application/ports/PersistenceRecoveryPort'

type PersistenceUnavailableErrorOptions = ErrorOptions & {
  readonly diagnostic?: PersistenceV2MigrationDiagnostic
}

export class PersistenceUnavailableError extends Error {
  readonly code: PersistenceBootstrapErrorCode
  readonly diagnostic: PersistenceV2MigrationDiagnostic | undefined

  constructor(
    code: PersistenceBootstrapErrorCode,
    options?: PersistenceUnavailableErrorOptions,
  ) {
    super(`Persistence is unavailable (${code}).`, options)
    this.name = 'PersistenceUnavailableError'
    this.code = code
    this.diagnostic = options?.diagnostic
  }
}

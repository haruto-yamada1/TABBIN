import type { PersistenceBootstrapErrorCode } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export class PersistenceUnavailableError extends Error {
  readonly code: PersistenceBootstrapErrorCode

  constructor(code: PersistenceBootstrapErrorCode, options?: ErrorOptions) {
    super(`Persistence is unavailable (${code}).`, options)
    this.name = 'PersistenceUnavailableError'
    this.code = code
  }
}

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceBootstrapPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export type PersistenceBootstrapServiceOptions = {
  readonly initialize: () => Promise<void>
}

/** Opens the current database, including its IndexedDB schema upgrades. */
export class PersistenceBootstrapService implements PersistenceBootstrapPort {
  private readyPromise: Promise<void> | undefined
  private readonly options: PersistenceBootstrapServiceOptions

  constructor(options: PersistenceBootstrapServiceOptions) {
    this.options = options
  }

  readonly ready = async (): Promise<void> => {
    const promise =
      this.readyPromise ??
      this.options.initialize().catch((error: unknown) => {
        if (error instanceof PersistenceUnavailableError) {
          throw error
        }
        throw new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED', {
          cause: error,
        })
      })
    this.readyPromise = promise
    try {
      await promise
    } finally {
      // A failed open can be retried; future calls also observe connection closure
      // and version changes rather than caching readiness for the entire process.
      if (this.readyPromise === promise) {
        this.readyPromise = undefined
      }
    }
  }
}

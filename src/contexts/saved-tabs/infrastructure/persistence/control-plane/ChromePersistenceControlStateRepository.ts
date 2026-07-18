import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceControlState,
  PersistenceControlStateAccessPort,
  PersistenceControlStateRepositoryPort,
  PersistenceControlStateTransition,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import {
  decodePersistenceControlState,
  transitionPersistenceControlState,
} from '@/contexts/saved-tabs/application/services/PersistenceControlStateService'

export const PERSISTENCE_CONTROL_STATE_STORAGE_KEY =
  'tabbin:persistenceControlState:v2'

export type PersistenceControlStorageArea = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
  readonly setAccessLevel?: (options: {
    readonly accessLevel: 'TRUSTED_CONTEXTS'
  }) => Promise<void>
}

export type ChromePersistenceControlStateRepositoryOptions = {
  readonly getManifest: () => unknown
  readonly getStorageLocal: () => PersistenceControlStorageArea | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class ChromePersistenceControlStateRepository
  implements
    PersistenceControlStateAccessPort,
    PersistenceControlStateRepositoryPort
{
  private readonly options: ChromePersistenceControlStateRepositoryOptions

  constructor(options: ChromePersistenceControlStateRepositoryOptions) {
    this.options = options
  }

  readonly initialize = async (): Promise<void> => {
    const storage = this.getStorageLocal()
    if (storage.setAccessLevel) {
      try {
        await storage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
        return
      } catch (error) {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
          { cause: error },
        )
      }
    }

    let manifest: unknown
    try {
      manifest = this.options.getManifest()
    } catch (error) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
        { cause: error },
      )
    }
    if (!isRecord(manifest)) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
      )
    }
    const contentScripts = manifest.content_scripts
    if (
      contentScripts !== undefined &&
      (!Array.isArray(contentScripts) || contentScripts.length > 0)
    ) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
      )
    }
  }

  readonly read = async (): Promise<PersistenceControlState> => {
    const storage = this.getStorageLocal()
    try {
      const stored = await storage.get(PERSISTENCE_CONTROL_STATE_STORAGE_KEY)
      return decodePersistenceControlState(
        stored[PERSISTENCE_CONTROL_STATE_STORAGE_KEY],
      )
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        throw error
      }
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
        { cause: error },
      )
    }
  }

  readonly transition = async (
    transition: PersistenceControlStateTransition,
  ): Promise<PersistenceControlState> => {
    const current = await this.read()
    const next = transitionPersistenceControlState(current, transition)
    const storage = this.getStorageLocal()
    try {
      await storage.set({ [PERSISTENCE_CONTROL_STATE_STORAGE_KEY]: next })
      return next
    } catch (error) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
        { cause: error },
      )
    }
  }

  private readonly getStorageLocal = (): PersistenceControlStorageArea => {
    const storage = this.options.getStorageLocal()
    if (!storage) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
      )
    }
    return storage
  }
}

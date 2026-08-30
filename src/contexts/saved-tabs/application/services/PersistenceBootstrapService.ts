import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapErrorCode,
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateAccessPort,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceMigrationLifecyclePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export type PersistenceBootstrapServiceOptions = {
  readonly access: PersistenceControlStateAccessPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly coordination: PersistenceCoordinationPort
  readonly cutoverPolicy?: 'complete' | 'defer'
  readonly migrationLifecycle?: PersistenceMigrationLifecyclePort
}

export class PersistenceBootstrapService implements PersistenceBootstrapPort {
  private accessPromise: Promise<void> | undefined
  private readonly options: PersistenceBootstrapServiceOptions
  private readyPromise: Promise<void> | undefined

  constructor(options: PersistenceBootstrapServiceOptions) {
    this.options = options
  }

  readonly migrate = async (migrationId: string): Promise<void> => {
    await this.ensureAccessPolicy()
    await this.options.coordination.runExclusive(async () => {
      const state = await this.options.controlStateRepository.read()
      await this.resumeState(state, migrationId)
    })
  }

  readonly readState = async (): Promise<PersistenceControlState> => {
    await this.ensureAccessPolicy()
    return this.options.coordination.runShared(async () => {
      const state = await this.options.controlStateRepository.read()
      return state
    })
  }

  readonly ready = async (): Promise<void> => {
    if (this.readyPromise) {
      return this.readyPromise
    }

    const promise = this.ensureReady()
    this.readyPromise = promise
    try {
      await promise
    } finally {
      if (this.readyPromise === promise) {
        this.readyPromise = undefined
      }
    }
  }

  private readonly ensureAccessPolicy = async (): Promise<void> => {
    if (this.accessPromise) {
      return this.accessPromise
    }

    const promise = this.options.access.initialize().catch((error: unknown) => {
      if (this.accessPromise === promise) {
        this.accessPromise = undefined
      }
      if (error instanceof PersistenceUnavailableError) {
        throw error
      }
      throw new PersistenceUnavailableError(
        'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
        { cause: error },
      )
    })
    this.accessPromise = promise
    return promise
  }

  private readonly ensureReady = async (): Promise<void> => {
    await this.ensureAccessPolicy()
    const observed = await this.options.coordination.runShared(async () => {
      const state = await this.options.controlStateRepository.read()
      return state
    })
    if (this.isStableState(observed)) {
      return
    }

    await this.options.coordination.runExclusive(async () => {
      const latest = await this.options.controlStateRepository.read()
      if (this.isStableState(latest)) {
        return
      }
      await this.resumeState(latest)
    })
  }

  private readonly isStableState = (state: PersistenceControlState): boolean =>
    state.status === 'legacy' ||
    state.status === 'indexeddb' ||
    state.status === 'read-only-emergency'

  private readonly resumeState = async (
    initialState: PersistenceControlState,
    requestedMigrationId?: string,
  ): Promise<void> => {
    if (
      requestedMigrationId === undefined &&
      this.isStableState(initialState)
    ) {
      return
    }

    let state = await this.prepareMigrationState(
      initialState,
      requestedMigrationId,
    )

    if (
      requestedMigrationId !== undefined &&
      'migrationId' in state &&
      state.migrationId !== requestedMigrationId
    ) {
      throw new PersistenceUnavailableError('PERSISTENCE_INVALID_TRANSITION')
    }

    if (state.status === 'migrating') {
      const lifecycle = this.requireLifecycle()
      const migrationId = state.migrationId
      await this.validatePreflightFingerprint(lifecycle, migrationId)
      await this.runLifecyclePhase(
        'PERSISTENCE_MIGRATION_FAILED',
        migrationId,
        async () => {
          await lifecycle.migrate(migrationId)
        },
      )
      state = await this.options.controlStateRepository.transition({
        type: 'begin-verification',
        migrationId,
      })
    }

    if (state.status === 'verifying') {
      const lifecycle = this.requireLifecycle()
      const migrationId = state.migrationId
      await this.runLifecyclePhase(
        'PERSISTENCE_VERIFICATION_FAILED',
        migrationId,
        async () => {
          await lifecycle.verify(migrationId)
        },
      )
      state = await this.options.controlStateRepository.transition({
        type: 'mark-cutover-pending',
        migrationId,
      })
    }

    if (state.status === 'cutover-pending') {
      if (this.options.cutoverPolicy !== 'complete') {
        return
      }
      await this.options.controlStateRepository.transition({
        type: 'complete-cutover',
        migrationId: state.migrationId,
      })
      return
    }

    if (state.status !== 'indexeddb') {
      throw new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED')
    }
  }

  private readonly prepareMigrationState = async (
    initialState: PersistenceControlState,
    requestedMigrationId?: string,
  ): Promise<PersistenceControlState> => {
    if (this.isStableState(initialState) && initialState.status !== 'legacy') {
      throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
    }

    let migrationId = requestedMigrationId
    if (initialState.status === 'failed') {
      migrationId ??= initialState.migrationId
      if (!migrationId) {
        throw new PersistenceUnavailableError(initialState.errorCode)
      }
    }

    if (initialState.status !== 'legacy' && initialState.status !== 'failed') {
      return initialState
    }
    if (!migrationId) {
      throw new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED')
    }
    return this.options.controlStateRepository.transition({
      type: 'begin-migration',
      migrationId,
    })
  }

  private readonly requireLifecycle = (): PersistenceMigrationLifecyclePort => {
    const lifecycle = this.options.migrationLifecycle
    if (!lifecycle) {
      throw new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED')
    }
    return lifecycle
  }

  private readonly validatePreflightFingerprint = async (
    lifecycle: PersistenceMigrationLifecyclePort,
    migrationId: string,
  ): Promise<void> => {
    const fingerprints = await this.runLifecyclePhase(
      'PERSISTENCE_MIGRATION_FAILED',
      migrationId,
      async () => ({
        current: await lifecycle.readCurrentSourceFingerprint(),
        preflight: await lifecycle.readPreflightSourceFingerprint(migrationId),
      }),
    )
    if (fingerprints.current === fingerprints.preflight) {
      return
    }

    await this.options.controlStateRepository.transition({
      type: 'fail',
      migrationId,
      errorCode: 'PERSISTENCE_PREFLIGHT_STALE',
    })
    throw new PersistenceUnavailableError('PERSISTENCE_PREFLIGHT_STALE')
  }

  private readonly runLifecyclePhase = async <Result>(
    errorCode: Extract<
      PersistenceBootstrapErrorCode,
      'PERSISTENCE_MIGRATION_FAILED' | 'PERSISTENCE_VERIFICATION_FAILED'
    >,
    migrationId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    try {
      return await operation()
    } catch (error) {
      const diagnostic =
        this.options.migrationLifecycle?.readFailureDiagnostic?.()
      await this.options.controlStateRepository.transition({
        type: 'fail',
        migrationId,
        errorCode,
        ...(diagnostic?.migrationId === migrationId ? { diagnostic } : {}),
      })
      throw new PersistenceUnavailableError(errorCode, { cause: error })
    }
  }
}

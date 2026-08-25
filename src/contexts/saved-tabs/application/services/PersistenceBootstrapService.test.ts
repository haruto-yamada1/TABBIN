import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceControlState,
  PersistenceControlStateAccessPort,
  PersistenceControlStateRepositoryPort,
  PersistenceControlStateTransition,
  PersistenceCoordinationPort,
  PersistenceMigrationLifecyclePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createCompletePersistenceBootstrapServiceForTesting } from '@/contexts/saved-tabs/testing/createCompletePersistenceBootstrapService'

import { PersistenceBootstrapService } from './PersistenceBootstrapService'
import { transitionPersistenceControlState } from './PersistenceControlStateService'

class FakeControlStateRepository implements PersistenceControlStateRepositoryPort {
  state: PersistenceControlState

  constructor(state: PersistenceControlState) {
    this.state = state
  }

  readonly read = vi.fn(
    async (): Promise<PersistenceControlState> => this.state,
  )

  readonly transition = vi.fn(
    async (
      transition: PersistenceControlStateTransition,
    ): Promise<PersistenceControlState> => {
      this.state = transitionPersistenceControlState(this.state, transition)
      return this.state
    },
  )
}

class SerialPersistenceCoordinator implements PersistenceCoordinationPort {
  private tail: Promise<void> = Promise.resolve()

  readonly runExclusive = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = await this.enqueue(operation)
    return result
  }

  readonly runShared = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = await this.enqueue(operation)
    return result
  }

  private readonly enqueue = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    const settled = await result
    return settled
  }
}

const createAccess = (): PersistenceControlStateAccessPort => ({
  initialize: vi.fn(async () => undefined),
})

const createLifecycle = (): PersistenceMigrationLifecyclePort => ({
  readCurrentSourceFingerprint: vi.fn(async () => 'fingerprint-a'),
  readPreflightSourceFingerprint: vi.fn(async () => 'fingerprint-a'),
  migrate: vi.fn(async () => undefined),
  verify: vi.fn(async () => undefined),
})

const expectUnavailableCode = async (
  operation: Promise<unknown>,
  code: PersistenceUnavailableError['code'],
): Promise<void> => {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect((error as PersistenceUnavailableError).code).toBe(code)
    return
  }
  throw new Error('Expected persistence bootstrap to fail.')
}

describe('PersistenceBootstrapService', () => {
  it('initializes trusted access before reading state under coordination', async () => {
    const access = createAccess()
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const service = new PersistenceBootstrapService({
      access,
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
    })

    await expect(service.readState()).resolves.toEqual({ status: 'legacy' })
    expect(access.initialize).toHaveBeenCalledTimes(1)
    expect(repository.read).toHaveBeenCalledTimes(1)
  })

  it('classifies access failure and retries initialization on the next call', async () => {
    const accessError = new Error('access unavailable')
    const access: PersistenceControlStateAccessPort = {
      initialize: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(accessError)
        .mockResolvedValueOnce(undefined),
    }
    const service = new PersistenceBootstrapService({
      access,
      controlStateRepository: new FakeControlStateRepository({
        status: 'legacy',
      }),
      coordination: new SerialPersistenceCoordinator(),
    })

    await expectUnavailableCode(
      service.ready(),
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
    await expect(service.ready()).resolves.toBeUndefined()
    expect(access.initialize).toHaveBeenCalledTimes(2)
  })

  it('preserves an already typed access-policy failure', async () => {
    const accessError = new PersistenceUnavailableError(
      'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
    )
    const service = new PersistenceBootstrapService({
      access: {
        initialize: vi.fn(async () => {
          throw accessError
        }),
      },
      controlStateRepository: new FakeControlStateRepository({
        status: 'legacy',
      }),
      coordination: new SerialPersistenceCoordinator(),
    })

    await expect(service.ready()).rejects.toBe(accessError)
  })

  it('single-flights simultaneous ready calls in one extension context', async () => {
    const access = createAccess()
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const service = new PersistenceBootstrapService({
      access,
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
    })

    await Promise.all([service.ready(), service.ready(), service.ready()])

    expect(access.initialize).toHaveBeenCalledTimes(1)
    expect(repository.read).toHaveBeenCalledTimes(1)
  })

  it.each(['background-first', 'options-first'])(
    'allows %s bootstrap from a stable legacy state',
    async () => {
      const repository = new FakeControlStateRepository({ status: 'legacy' })
      const service = new PersistenceBootstrapService({
        access: createAccess(),
        controlStateRepository: repository,
        coordination: new SerialPersistenceCoordinator(),
      })

      await expect(service.ready()).resolves.toBeUndefined()
      expect(repository.state).toEqual({ status: 'legacy' })
    },
  )

  it('lets only one simultaneous context resume an interrupted migration', async () => {
    const repository = new FakeControlStateRepository({
      status: 'migrating',
      migrationId: 'migration-1',
    })
    const lifecycle = createLifecycle()
    const coordination = new SerialPersistenceCoordinator()
    const createContext = () =>
      createCompletePersistenceBootstrapServiceForTesting({
        access: createAccess(),
        controlStateRepository: repository,
        coordination,
        migrationLifecycle: lifecycle,
      })

    await Promise.all([createContext().ready(), createContext().ready()])

    expect(lifecycle.migrate).toHaveBeenCalledTimes(1)
    expect(lifecycle.verify).toHaveBeenCalledTimes(1)
    expect(repository.state).toEqual({
      status: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 2,
    })
  })

  it('resumes verification after an MV3 service-worker restart', async () => {
    const repository = new FakeControlStateRepository({
      status: 'verifying',
      migrationId: 'migration-1',
    })
    const lifecycle = createLifecycle()
    const restarted = createCompletePersistenceBootstrapServiceForTesting({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await restarted.ready()

    expect(lifecycle.migrate).not.toHaveBeenCalled()
    expect(lifecycle.verify).toHaveBeenCalledWith('migration-1')
    expect(repository.state.status).toBe('indexeddb')
  })

  it('finalizes cutover-pending after restart without rerunning verification', async () => {
    const repository = new FakeControlStateRepository({
      status: 'cutover-pending',
      migrationId: 'migration-1',
    })
    const lifecycle = createLifecycle()
    const restarted = createCompletePersistenceBootstrapServiceForTesting({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await restarted.ready()

    expect(lifecycle.migrate).not.toHaveBeenCalled()
    expect(lifecycle.verify).not.toHaveBeenCalled()
    expect(repository.state.status).toBe('indexeddb')
  })

  it('defers cutover-pending by default until completion is explicitly enabled', async () => {
    const repository = new FakeControlStateRepository({
      status: 'cutover-pending',
      migrationId: 'migration-1',
    })
    const lifecycle = createLifecycle()
    const restarted = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await restarted.ready()

    expect(lifecycle.migrate).not.toHaveBeenCalled()
    expect(lifecycle.verify).not.toHaveBeenCalled()
    expect(repository.transition).not.toHaveBeenCalled()
    expect(repository.state).toEqual({
      status: 'cutover-pending',
      migrationId: 'migration-1',
    })
  })

  it('runs migration and verification before publishing indexeddb state', async () => {
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const lifecycle = createLifecycle()
    const service = createCompletePersistenceBootstrapServiceForTesting({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await service.migrate('migration-1')

    expect(lifecycle.readCurrentSourceFingerprint).toHaveBeenCalledTimes(1)
    expect(lifecycle.readPreflightSourceFingerprint).toHaveBeenCalledWith(
      'migration-1',
    )
    expect(lifecycle.migrate).toHaveBeenCalledWith('migration-1')
    expect(lifecycle.verify).toHaveBeenCalledWith('migration-1')
    expect(
      repository.transition.mock.calls.map(([value]) => value.type),
    ).toEqual([
      'begin-migration',
      'begin-verification',
      'mark-cutover-pending',
      'complete-cutover',
    ])
    expect(repository.state.status).toBe('indexeddb')
  })

  it('rejects a stale preflight fingerprint before migration writes begin', async () => {
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const lifecycle = createLifecycle()
    vi.mocked(lifecycle.readCurrentSourceFingerprint).mockResolvedValueOnce(
      'fingerprint-b',
    )
    const service = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await expectUnavailableCode(
      service.migrate('migration-1'),
      'PERSISTENCE_PREFLIGHT_STALE',
    )
    expect(lifecycle.readPreflightSourceFingerprint).toHaveBeenCalledWith(
      'migration-1',
    )
    expect(lifecycle.readCurrentSourceFingerprint).toHaveBeenCalledTimes(1)
    expect(lifecycle.migrate).not.toHaveBeenCalled()
    expect(repository.state).toEqual({
      status: 'failed',
      migrationId: 'migration-1',
      errorCode: 'PERSISTENCE_PREFLIGHT_STALE',
    })
  })

  it('persists migration failure and never starts verification', async () => {
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const lifecycle = createLifecycle()
    vi.mocked(lifecycle.migrate).mockRejectedValueOnce(new Error('copy failed'))
    const service = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await expectUnavailableCode(
      service.migrate('migration-1'),
      'PERSISTENCE_MIGRATION_FAILED',
    )
    expect(lifecycle.verify).not.toHaveBeenCalled()
    expect(repository.state).toEqual({
      status: 'failed',
      migrationId: 'migration-1',
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
    })
  })

  it('persists verification failure without publishing cutover-pending', async () => {
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const lifecycle = createLifecycle()
    vi.mocked(lifecycle.verify).mockRejectedValueOnce(
      new Error('verification failed'),
    )
    const service = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await expectUnavailableCode(
      service.migrate('migration-1'),
      'PERSISTENCE_VERIFICATION_FAILED',
    )
    expect(repository.state).toEqual({
      status: 'failed',
      migrationId: 'migration-1',
      errorCode: 'PERSISTENCE_VERIFICATION_FAILED',
    })
  })

  it('retries a persisted failed migration after the cause is repaired', async () => {
    const repository = new FakeControlStateRepository({ status: 'legacy' })
    const lifecycle = createLifecycle()
    vi.mocked(lifecycle.migrate).mockRejectedValueOnce(new Error('temporary'))
    const service = createCompletePersistenceBootstrapServiceForTesting({
      access: createAccess(),
      controlStateRepository: repository,
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })

    await expect(service.migrate('migration-1')).rejects.toBeInstanceOf(
      PersistenceUnavailableError,
    )
    await expect(service.ready()).resolves.toBeUndefined()

    expect(lifecycle.migrate).toHaveBeenCalledTimes(2)
    expect(repository.state.status).toBe('indexeddb')
  })

  it('does not require lifecycle code for completed or legacy states', async () => {
    expect.hasAssertions()
    await Promise.all(
      [
        { status: 'legacy' } as const,
        {
          status: 'indexeddb',
          migrationId: 'migration-1',
          persistenceGeneration: 2,
        } as const,
      ].map(async (state) => {
        const service = new PersistenceBootstrapService({
          access: createAccess(),
          controlStateRepository: new FakeControlStateRepository(state),
          coordination: new SerialPersistenceCoordinator(),
        })
        await expect(service.ready()).resolves.toBeUndefined()
      }),
    )
  })

  it('fails closed when restart recovery has no migration lifecycle', async () => {
    expect.hasAssertions()
    const service = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: new FakeControlStateRepository({
        status: 'verifying',
        migrationId: 'migration-1',
      }),
      coordination: new SerialPersistenceCoordinator(),
    })

    await expectUnavailableCode(
      service.ready(),
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
  })

  it('rejects migration after cutover and mismatched migration ownership', async () => {
    expect.hasAssertions()
    const lifecycle = createLifecycle()
    const indexedDb = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: new FakeControlStateRepository({
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      }),
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })
    await expectUnavailableCode(
      indexedDb.migrate('migration-2'),
      'PERSISTENCE_ROUTE_MISMATCH',
    )

    const owned = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: new FakeControlStateRepository({
        status: 'migrating',
        migrationId: 'migration-1',
      }),
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: lifecycle,
    })
    await expectUnavailableCode(
      owned.migrate('migration-2'),
      'PERSISTENCE_INVALID_TRANSITION',
    )
    expect(lifecycle.migrate).not.toHaveBeenCalled()
  })

  it('keeps a failed state without migration ownership fail-closed', async () => {
    expect.hasAssertions()
    const service = new PersistenceBootstrapService({
      access: createAccess(),
      controlStateRepository: new FakeControlStateRepository({
        status: 'failed',
        errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
      }),
      coordination: new SerialPersistenceCoordinator(),
      migrationLifecycle: createLifecycle(),
    })

    await expectUnavailableCode(
      service.ready(),
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
  })
})

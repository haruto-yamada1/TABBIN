import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceRecoveryReporterPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { PersistenceOperationGateService } from './PersistenceOperationGateService'

const createBootstrap = (): PersistenceBootstrapPort => ({
  migrate: vi.fn(async () => undefined),
  readState: vi.fn(async () => ({ status: 'legacy' }) as const),
  ready: vi.fn(async () => undefined),
})

const createRepository = (
  state: PersistenceControlState,
): PersistenceControlStateRepositoryPort => ({
  read: vi.fn(async () => state),
  transition: vi.fn(async () => state),
})

const createCoordination = (
  events?: string[],
): PersistenceCoordinationPort => ({
  runExclusive: async (operation) => operation(),
  runShared: async (operation) => {
    events?.push('lock')
    const result = await operation()
    events?.push('unlock')
    return result
  },
})

const createRecovery = (): PersistenceRecoveryReporterPort => ({
  reportUnavailable: vi.fn(),
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
  throw new Error('Expected persistence operation gate to reject.')
}

describe('PersistenceOperationGateService', () => {
  it.each([
    {
      state: { status: 'legacy' } as const,
      method: 'runLegacyRead' as const,
    },
    {
      state: { status: 'legacy' } as const,
      method: 'runLegacyWrite' as const,
    },
    {
      state: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      } as const,
      method: 'runIndexedDbRead' as const,
    },
    {
      state: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      } as const,
      method: 'runIndexedDbWrite' as const,
    },
    {
      state: {
        status: 'read-only-emergency',
        readSource: 'legacy',
      } as const,
      method: 'runLegacyRead' as const,
    },
    {
      state: {
        status: 'read-only-emergency',
        readSource: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      } as const,
      method: 'runIndexedDbRead' as const,
    },
  ])('allows matching $method in $state.status', async ({ state, method }) => {
    const bootstrap = createBootstrap()
    const events: string[] = []
    const gate = new PersistenceOperationGateService({
      bootstrap,
      controlStateRepository: createRepository(state),
      coordination: createCoordination(events),
      recovery: createRecovery(),
    })

    await expect(
      gate[method](async () => {
        events.push('operation')
        return 'result'
      }),
    ).resolves.toBe('result')
    expect(bootstrap.ready).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['lock', 'operation', 'unlock'])
  })

  it.each([
    {
      state: { status: 'legacy' } as const,
      method: 'runIndexedDbRead' as const,
      code: 'PERSISTENCE_ROUTE_MISMATCH' as const,
    },
    {
      state: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      } as const,
      method: 'runLegacyWrite' as const,
      code: 'PERSISTENCE_ROUTE_MISMATCH' as const,
    },
    {
      state: {
        status: 'read-only-emergency',
        readSource: 'legacy',
      } as const,
      method: 'runLegacyWrite' as const,
      code: 'PERSISTENCE_READ_ONLY' as const,
    },
    {
      state: {
        status: 'read-only-emergency',
        readSource: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      } as const,
      method: 'runIndexedDbWrite' as const,
      code: 'PERSISTENCE_READ_ONLY' as const,
    },
    {
      state: {
        status: 'read-only-emergency',
        readSource: 'legacy',
      } as const,
      method: 'runIndexedDbRead' as const,
      code: 'PERSISTENCE_ROUTE_MISMATCH' as const,
    },
    {
      state: {
        status: 'migrating',
        migrationId: 'migration-1',
      } as const,
      method: 'runLegacyRead' as const,
      code: 'PERSISTENCE_RECOVERY_REQUIRED' as const,
    },
    {
      state: {
        status: 'verifying',
        migrationId: 'migration-1',
      } as const,
      method: 'runLegacyRead' as const,
      code: 'PERSISTENCE_RECOVERY_REQUIRED' as const,
    },
    {
      state: {
        status: 'cutover-pending',
        migrationId: 'migration-1',
      } as const,
      method: 'runIndexedDbRead' as const,
      code: 'PERSISTENCE_RECOVERY_REQUIRED' as const,
    },
    {
      state: {
        status: 'failed',
        migrationId: 'migration-1',
        errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      } as const,
      method: 'runIndexedDbRead' as const,
      code: 'PERSISTENCE_MIGRATION_FAILED' as const,
    },
  ])(
    'rejects $method in $state.status without invoking the operation',
    async ({ state, method, code }) => {
      const operation = vi.fn(async () => 'unexpected')
      const recovery = createRecovery()
      const gate = new PersistenceOperationGateService({
        bootstrap: createBootstrap(),
        controlStateRepository: createRepository(state),
        coordination: createCoordination(),
        recovery,
      })

      await expectUnavailableCode(gate[method](operation), code)
      expect(operation).not.toHaveBeenCalled()
      expect(recovery.reportUnavailable).toHaveBeenCalledWith(code)
    },
  )

  it('preserves operation errors after authorization', async () => {
    const operationError = new Error('repository failed')
    const gate = new PersistenceOperationGateService({
      bootstrap: createBootstrap(),
      controlStateRepository: createRepository({ status: 'legacy' }),
      coordination: createCoordination(),
      recovery: createRecovery(),
    })

    await expect(
      gate.runLegacyRead(async () => {
        throw operationError
      }),
    ).rejects.toBe(operationError)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapPort,
  PersistenceControlState,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
  PersistenceRecoveryReporterPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { PersistenceDataPlaneRouterService } from './PersistenceDataPlaneRouterService'

const createRouter = (state: PersistenceControlState) => {
  const bootstrap: PersistenceBootstrapPort = {
    migrate: vi.fn(async () => undefined),
    readState: vi.fn(async () => state),
    ready: vi.fn(async () => undefined),
  }
  const controlStateRepository: PersistenceControlStateRepositoryPort = {
    read: vi.fn(async () => state),
    transition: vi.fn(async () => state),
  }
  const coordination: PersistenceCoordinationPort = {
    runExclusive: async (operation) => operation(),
    runShared: async (operation) => operation(),
  }
  const recovery: PersistenceRecoveryReporterPort = {
    reportUnavailable: vi.fn(),
  }

  return {
    bootstrap,
    recovery,
    router: new PersistenceDataPlaneRouterService({
      bootstrap,
      controlStateRepository,
      coordination,
      recovery,
    }),
  }
}

describe('PersistenceDataPlaneRouterService', () => {
  it.each([
    ['read', 'legacy'],
    ['write', 'legacy'],
    ['read', 'indexeddb'],
    ['write', 'indexeddb'],
  ] as const)(
    'routes a %s operation to the %s repository only',
    async (operationKind, route) => {
      const state: PersistenceControlState =
        route === 'legacy'
          ? { status: 'legacy' }
          : {
              status: 'indexeddb',
              migrationId: 'migration-1',
              persistenceGeneration: 2,
            }
      const { recovery, router } = createRouter(state)
      const legacy = vi.fn(async () => 'legacy')
      const indexeddb = vi.fn(async () => 'indexeddb')

      const result = await router[operationKind]({ indexeddb, legacy })

      expect(result).toBe(route)
      expect(legacy).toHaveBeenCalledTimes(route === 'legacy' ? 1 : 0)
      expect(indexeddb).toHaveBeenCalledTimes(route === 'indexeddb' ? 1 : 0)
      expect(recovery.reportUnavailable).not.toHaveBeenCalledWith(
        'PERSISTENCE_ROUTE_MISMATCH',
      )
    },
  )

  it('does not silently fall back to legacy when the IndexedDB read fails', async () => {
    const { router } = createRouter({
      status: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 2,
    })
    const failure = new Error('indexeddb read failed')
    const legacy = vi.fn(async () => 'legacy')
    const indexeddb = vi.fn(async () => {
      throw failure
    })

    await expect(router.read({ indexeddb, legacy })).rejects.toBe(failure)
    expect(indexeddb).toHaveBeenCalledOnce()
    expect(legacy).not.toHaveBeenCalled()
  })

  it('never dual-writes when the selected repository fails', async () => {
    const { router } = createRouter({ status: 'legacy' })
    const failure = new Error('legacy write failed')
    const legacy = vi.fn(async () => {
      throw failure
    })
    const indexeddb = vi.fn(async () => 'indexeddb')

    await expect(router.write({ indexeddb, legacy })).rejects.toBe(failure)
    expect(legacy).toHaveBeenCalledOnce()
    expect(indexeddb).not.toHaveBeenCalled()
  })

  it('uses the declared read source and blocks writes in read-only emergency', async () => {
    const { router } = createRouter({
      status: 'read-only-emergency',
      readSource: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 2,
    })
    const legacy = vi.fn(async () => 'legacy')
    const indexeddb = vi.fn(async () => 'indexeddb')

    await expect(router.read({ indexeddb, legacy })).resolves.toBe('indexeddb')
    await expect(router.write({ indexeddb, legacy })).rejects.toMatchObject({
      code: 'PERSISTENCE_READ_ONLY',
    })
    expect(legacy).not.toHaveBeenCalled()
    expect(indexeddb).toHaveBeenCalledOnce()
  })

  it('fails closed before either repository is called in transitional state', async () => {
    const { recovery, router } = createRouter({
      status: 'cutover-pending',
      migrationId: 'migration-1',
    })
    const legacy = vi.fn(async () => 'legacy')
    const indexeddb = vi.fn(async () => 'indexeddb')

    await expect(router.read({ indexeddb, legacy })).rejects.toEqual(
      new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED'),
    )
    expect(legacy).not.toHaveBeenCalled()
    expect(indexeddb).not.toHaveBeenCalled()
    expect(recovery.reportUnavailable).toHaveBeenCalledWith(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
  })

  it('propagates the recorded error code in failed state without invoking either backend', async () => {
    const diagnostic = {
      errorCode: 'MIGRATION_TARGET_WRITE_FAILED' as const,
      issueCodes: ['DUPLICATE_URL_ID'],
      migrationId: 'migration-1',
      sourceBytes: 128,
      sourceEntityCounts: { urls: 2 },
      stage: 'target-write' as const,
    }
    const { recovery, router } = createRouter({
      status: 'failed',
      diagnostic,
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      migrationId: 'migration-1',
    })
    const legacy = vi.fn(async () => 'legacy')
    const indexeddb = vi.fn(async () => 'indexeddb')

    await expect(router.read({ indexeddb, legacy })).rejects.toMatchObject({
      code: 'PERSISTENCE_MIGRATION_FAILED',
      diagnostic,
    })
    expect(legacy).not.toHaveBeenCalled()
    expect(indexeddb).not.toHaveBeenCalled()
    expect(recovery.reportUnavailable).toHaveBeenCalledWith(
      'PERSISTENCE_MIGRATION_FAILED',
      diagnostic,
    )
  })
})

import { describe, expect, it, vi } from 'vitest'

import type {
  PersistenceControlState,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { transitionPersistenceControlState } from '@/contexts/saved-tabs/application/services/PersistenceControlStateService'
import { PersistenceDataPlaneRouterService } from '@/contexts/saved-tabs/application/services/PersistenceDataPlaneRouterService'
import { PersistenceRecoveryService } from '@/contexts/saved-tabs/application/services/PersistenceRecoveryService'
import { createCompletePersistenceBootstrapServiceForTesting } from '@/contexts/saved-tabs/testing/createCompletePersistenceBootstrapService'

describe('phase 1 cutover-capable data plane', () => {
  it('lets migration integration tests complete cutover and route to IndexedDB only', async () => {
    let state: PersistenceControlState = {
      status: 'cutover-pending',
      migrationId: 'migration-1',
    }
    const controlStateRepository: PersistenceControlStateRepositoryPort = {
      read: vi.fn(async () => state),
      transition: vi.fn(async (transition) => {
        state = transitionPersistenceControlState(state, transition)
        return state
      }),
    }
    const coordination: PersistenceCoordinationPort = {
      runExclusive: async (operation) => operation(),
      runShared: async (operation) => operation(),
    }
    const bootstrap = createCompletePersistenceBootstrapServiceForTesting({
      access: { initialize: vi.fn(async () => undefined) },
      controlStateRepository,
      coordination,
    })
    const recovery = new PersistenceRecoveryService({
      retry: async () => bootstrap.ready(),
    })
    const router = new PersistenceDataPlaneRouterService({
      bootstrap,
      controlStateRepository,
      coordination,
      recovery,
    })
    const legacyRepository = vi.fn(async () => 'legacy')
    const indexedDbRepository = vi.fn(async () => 'indexeddb')

    await expect(
      router.read({
        indexeddb: indexedDbRepository,
        legacy: legacyRepository,
      }),
    ).resolves.toBe('indexeddb')

    expect(state).toEqual({
      status: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 2,
    })
    expect(indexedDbRepository).toHaveBeenCalledOnce()
    expect(legacyRepository).not.toHaveBeenCalled()
    expect(recovery.getSnapshot()).toEqual({ status: 'available' })
  })
})

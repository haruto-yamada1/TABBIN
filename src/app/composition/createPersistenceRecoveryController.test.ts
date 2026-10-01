import { describe, expect, it, vi } from 'vitest'

import type { PersistenceRecoveryControllerPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { getPersistenceRecoveryController } from './createPersistenceRecoveryController'

const mocked = vi.hoisted(() => ({ getRuntime: vi.fn() }))
vi.mock(
  '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime',
  () => ({ getPersistenceBootstrapRuntime: mocked.getRuntime }),
)

describe('getPersistenceRecoveryController', () => {
  it('shares the IndexedDB runtime recovery state and retry action without migration services', async () => {
    const recovery: PersistenceRecoveryControllerPort = {
      clear: vi.fn(),
      getSnapshot: () => ({
        status: 'unavailable',
        errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
      }),
      reportUnavailable: vi.fn(),
      retry: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    }
    mocked.getRuntime.mockReturnValue({ recovery })

    const controller = getPersistenceRecoveryController()
    expect(controller).toBe(recovery)
    await controller.retry()
    expect(recovery.retry).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'

const mocked = vi.hoisted(() => ({
  getLegacyStorageCleanupRuntime: vi.fn(),
}))

vi.mock(
  '@/contexts/saved-tabs/infrastructure/composition/legacyStorageCleanupRuntime',
  () => ({
    getLegacyStorageCleanupRuntime: mocked.getLegacyStorageCleanupRuntime,
  }),
)

import {
  createLegacyStorageCleanupController,
  getLegacyStorageCleanupController,
  resetLegacyStorageCleanupControllerForTesting,
} from './createLegacyStorageCleanupController'

beforeEach(() => {
  resetLegacyStorageCleanupControllerForTesting()
  vi.clearAllMocks()
})

describe('createLegacyStorageCleanupController', () => {
  it('returns the maintenance outcome without hiding it', async () => {
    const run = vi.fn(async () => 'retained' as const)
    const controller = createLegacyStorageCleanupController({
      service: { run },
    })

    await expect(controller.run()).resolves.toEqual({ status: 'retained' })
    expect(run).toHaveBeenCalledOnce()
  })

  it('returns a typed failure code without exposing stored user data', async () => {
    const run = vi.fn(async () => {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_TARGET_UNHEALTHY',
      )
    })
    const controller = createLegacyStorageCleanupController({
      service: { run },
    })

    await expect(controller.run()).resolves.toEqual({
      errorCode: 'LEGACY_STORAGE_CLEANUP_TARGET_UNHEALTHY',
      status: 'failed',
    })
  })

  it('does not suppress unexpected composition failures', async () => {
    const error = new Error('unexpected')
    const controller = createLegacyStorageCleanupController({
      service: {
        run: vi.fn(async () => {
          throw error
        }),
      },
    })

    await expect(controller.run()).rejects.toBe(error)
  })

  it('converts runtime initialization errors and retries on the next run', async () => {
    mocked.getLegacyStorageCleanupRuntime
      .mockImplementationOnce(() => {
        throw new LegacyStorageCleanupError(
          'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
        )
      })
      .mockReturnValue({
        service: { run: vi.fn(async () => 'skipped' as const) },
      })

    await expect(
      Promise.resolve().then(async () =>
        getLegacyStorageCleanupController().run(),
      ),
    ).resolves.toEqual({
      errorCode: 'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
      status: 'failed',
    })
    await expect(getLegacyStorageCleanupController().run()).resolves.toEqual({
      status: 'skipped',
    })
    expect(mocked.getLegacyStorageCleanupRuntime).toHaveBeenCalledTimes(2)
  })
})

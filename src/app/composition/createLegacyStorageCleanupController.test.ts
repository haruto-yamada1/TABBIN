import { describe, expect, it, vi } from 'vitest'

import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'

import { createLegacyStorageCleanupController } from './createLegacyStorageCleanupController'

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
})

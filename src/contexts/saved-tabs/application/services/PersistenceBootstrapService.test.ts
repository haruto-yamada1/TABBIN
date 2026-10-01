import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import { PersistenceBootstrapService } from './PersistenceBootstrapService'

describe('PersistenceBootstrapService', () => {
  it('coalesces concurrent opens and rechecks readiness after connection closure', async () => {
    const initialize = vi.fn(async () => undefined)
    const bootstrap = new PersistenceBootstrapService({ initialize })
    await Promise.all([bootstrap.ready(), bootstrap.ready()])
    expect(initialize).toHaveBeenCalledTimes(1)
    await bootstrap.ready()
    expect(initialize).toHaveBeenCalledTimes(2)
  })

  it('reports an open error without modifying data and permits a later retry', async () => {
    const error = new Error('blocked database')
    const initialize = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined)
    const bootstrap = new PersistenceBootstrapService({ initialize })
    await expect(bootstrap.ready()).rejects.toMatchObject({
      code: 'PERSISTENCE_RECOVERY_REQUIRED',
      cause: error,
    })
    await expect(bootstrap.ready()).resolves.toBeUndefined()
    expect(initialize).toHaveBeenCalledTimes(2)
  })

  it('preserves typed database unavailability', async () => {
    const error = new PersistenceUnavailableError(
      'PERSISTENCE_COORDINATION_UNAVAILABLE',
    )
    const bootstrap = new PersistenceBootstrapService({
      initialize: async () => {
        throw error
      },
    })
    await expect(bootstrap.ready()).rejects.toBe(error)
  })
})

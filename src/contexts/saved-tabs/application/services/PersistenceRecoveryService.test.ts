import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import { PersistenceRecoveryService } from './PersistenceRecoveryService'

describe('PersistenceRecoveryService', () => {
  it('publishes a typed unavailable state to every extension-page subscriber', () => {
    const service = new PersistenceRecoveryService({
      retry: vi.fn(async () => undefined),
    })
    const listener = vi.fn()
    service.subscribe(listener)

    service.reportUnavailable('PERSISTENCE_RECOVERY_REQUIRED')

    expect(service.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears the recovery state after a successful retry', async () => {
    const retry = vi.fn(async () => undefined)
    const service = new PersistenceRecoveryService({ retry })
    service.reportUnavailable('PERSISTENCE_RECOVERY_REQUIRED')

    await service.retry()

    expect(retry).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({ status: 'available' })
  })

  it('keeps the latest typed error visible when retry fails again', async () => {
    expect.hasAssertions()
    const retry = vi.fn(async () => {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_COORDINATION_UNAVAILABLE',
      )
    })
    const service = new PersistenceRecoveryService({ retry })
    service.reportUnavailable('PERSISTENCE_RECOVERY_REQUIRED')

    await expect(service.retry()).rejects.toMatchObject({
      code: 'PERSISTENCE_COORDINATION_UNAVAILABLE',
    })
    expect(service.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_COORDINATION_UNAVAILABLE',
    })
  })

  it('classifies an untyped retry failure without losing the recovery UI', async () => {
    expect.hasAssertions()
    const retry = vi.fn(async () => {
      throw new Error('unexpected')
    })
    const service = new PersistenceRecoveryService({ retry })

    await expect(service.retry()).rejects.toThrow('unexpected')
    expect(service.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    })
  })
})

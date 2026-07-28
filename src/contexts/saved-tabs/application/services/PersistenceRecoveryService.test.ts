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

    service.reportUnavailable('PERSISTENCE_MIGRATION_FAILED')

    expect(service.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears the recovery state after a successful retry', async () => {
    const retry = vi.fn(async () => undefined)
    const service = new PersistenceRecoveryService({ retry })
    service.reportUnavailable('PERSISTENCE_VERIFICATION_FAILED')

    await service.retry()

    expect(retry).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({ status: 'available' })
  })

  it('publishes the raw-free migration diagnostic with the recovery state', () => {
    const diagnostic = {
      errorCode: 'MIGRATION_TARGET_WRITE_FAILED' as const,
      issueCodes: [],
      migrationId: 'migration-1',
      sourceBytes: 42,
      sourceEntityCounts: { urls: 1 },
      stage: 'target-write' as const,
    }
    const service = new PersistenceRecoveryService({
      readDiagnostic: () => diagnostic,
      retry: vi.fn(async () => undefined),
    })

    service.reportUnavailable('PERSISTENCE_MIGRATION_FAILED')

    expect(service.getSnapshot()).toEqual({
      diagnostic,
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      status: 'unavailable',
    })
  })

  it('keeps the latest typed error visible when retry fails again', async () => {
    expect.hasAssertions()
    const retry = vi.fn(async () => {
      throw new PersistenceUnavailableError('PERSISTENCE_PREFLIGHT_STALE')
    })
    const service = new PersistenceRecoveryService({ retry })
    service.reportUnavailable('PERSISTENCE_MIGRATION_FAILED')

    await expect(service.retry()).rejects.toMatchObject({
      code: 'PERSISTENCE_PREFLIGHT_STALE',
    })
    expect(service.getSnapshot()).toEqual({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_PREFLIGHT_STALE',
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

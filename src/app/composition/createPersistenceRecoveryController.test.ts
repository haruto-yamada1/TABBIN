import { describe, expect, it, vi } from 'vitest'

import type { MigrationPreflightServicePort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceBootstrapRecoveryControllerPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import { createPersistenceRecoveryController } from './createPersistenceRecoveryController'

const rawLegacyStorage = Object.fromEntries(
  MIGRATION_SOURCE_KEYS.map((key) => [key, { status: 'missing' }]),
) as RawLegacyStorageSnapshot

const createBootstrapRecovery = (
  calls: string[],
): PersistenceBootstrapRecoveryControllerPort => ({
  clear: vi.fn(),
  getSnapshot: () => ({ status: 'available' }),
  reportUnavailable: vi.fn(),
  retry: vi.fn(async () => {
    calls.push('retry')
  }),
  subscribe: () => () => undefined,
})

const createPreflight = (
  status: Awaited<ReturnType<MigrationPreflightServicePort['run']>>,
  calls: string[],
): MigrationPreflightServicePort => ({
  createCurrentDataBackup: vi.fn(async () => rawLegacyStorage),
  readHealthySourceFingerprint: vi.fn(async () => 'fingerprint'),
  readStatus: vi.fn(async () => status),
  run: vi.fn(async () => {
    calls.push('preflight')
    return status
  }),
})

describe('createPersistenceRecoveryController', () => {
  it('creates the versioned emergency envelope through the raw preflight reader', async () => {
    const calls: string[] = []
    const preflight = createPreflight({ status: 'not-run' }, calls)
    const controller = createPersistenceRecoveryController({
      bootstrapRecovery: createBootstrapRecovery(calls),
      now: () => 123,
      preflight,
    })

    await expect(controller.createEmergencyBackup()).resolves.toEqual({
      createdAt: 123,
      format: 'tabbin-legacy-emergency-backup',
      rawLegacyStorage,
      version: 1,
      warning: 'contains-private-user-data',
    })
    expect(preflight.createCurrentDataBackup).toHaveBeenCalledTimes(1)
  })

  it('reruns preflight before retrying bootstrap', async () => {
    const calls: string[] = []
    const controller = createPersistenceRecoveryController({
      bootstrapRecovery: createBootstrapRecovery(calls),
      now: () => 123,
      preflight: createPreflight(
        {
          checkedAt: 1,
          diagnostic: {
            capacityStatus: 'ready',
            collisionCount: 0,
            entityCounts: {},
            issueCodes: [],
            preflightVersion: 1,
            sourceFingerprintVersion: 1,
          },
          status: 'healthy',
        },
        calls,
      ),
    })

    await controller.rerunPreflightAndRetry()

    expect(calls).toEqual(['preflight', 'retry'])
  })

  it('does not retry bootstrap when the repeated preflight is blocked', async () => {
    const calls: string[] = []
    const bootstrapRecovery = createBootstrapRecovery(calls)
    const controller = createPersistenceRecoveryController({
      bootstrapRecovery,
      now: () => 123,
      preflight: createPreflight(
        {
          checkedAt: 1,
          diagnostic: {
            capacityStatus: 'blocked',
            collisionCount: 0,
            entityCounts: {},
            issueCodes: ['MIGRATION_SOURCE_INVALID_TYPE'],
            preflightVersion: 1,
            sourceFingerprintVersion: 1,
          },
          issueCodes: ['MIGRATION_SOURCE_INVALID_TYPE'],
          status: 'blocked',
        },
        calls,
      ),
    })

    await expect(controller.rerunPreflightAndRetry()).rejects.toMatchObject({
      code: 'PERSISTENCE_PREFLIGHT_STALE',
    })
    expect(calls).toEqual(['preflight'])
    expect(bootstrapRecovery.reportUnavailable).toHaveBeenCalledWith(
      'PERSISTENCE_PREFLIGHT_STALE',
    )
  })
})

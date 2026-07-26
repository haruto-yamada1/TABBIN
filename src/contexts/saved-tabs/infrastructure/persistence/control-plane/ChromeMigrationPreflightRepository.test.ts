import { describe, expect, it, vi } from 'vitest'

import {
  ChromeMigrationPreflightRepository,
  MIGRATION_PREFLIGHT_STORAGE_KEY,
  MigrationPreflightRecordError,
} from './ChromeMigrationPreflightRepository'

const healthyRecord = {
  checkedAt: 123,
  diagnostic: {
    capacityStatus: 'ready' as const,
    collisionCount: 0,
    entityCounts: { urls: 2 },
    issueCodes: [],
    preflightVersion: 1,
    sourceFingerprintVersion: 1,
  },
  sourceFingerprint: 'v1:abc',
  status: 'healthy' as const,
}

describe('ChromeMigrationPreflightRepository', () => {
  it('returns undefined when the separate preflight record is absent', async () => {
    const repository = new ChromeMigrationPreflightRepository({
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    })

    await expect(repository.read()).resolves.toBeUndefined()
  })

  it('round-trips a valid record under the dedicated control key', async () => {
    const stored: Record<string, unknown> = {}
    const storage = {
      get: vi.fn(async () => stored),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(stored, values)
      }),
    }
    const repository = new ChromeMigrationPreflightRepository(storage)

    await repository.save(healthyRecord)

    expect(storage.set).toHaveBeenCalledWith({
      [MIGRATION_PREFLIGHT_STORAGE_KEY]: healthyRecord,
    })
    await expect(repository.read()).resolves.toEqual(healthyRecord)
  })

  it.each([
    null,
    { ...healthyRecord, checkedAt: -1 },
    { ...healthyRecord, sourceFingerprint: '' },
    { ...healthyRecord, status: 'unknown' },
    {
      ...healthyRecord,
      diagnostic: { ...healthyRecord.diagnostic, issueCodes: ['ok', 1] },
    },
    {
      ...healthyRecord,
      diagnostic: { ...healthyRecord.diagnostic, entityCounts: { urls: -1 } },
    },
  ])('fails closed for malformed stored state %#', async (value) => {
    const repository = new ChromeMigrationPreflightRepository({
      get: vi.fn(async () => ({ [MIGRATION_PREFLIGHT_STORAGE_KEY]: value })),
      set: vi.fn(async () => {}),
    })

    await expect(repository.read()).rejects.toBeInstanceOf(
      MigrationPreflightRecordError,
    )
  })

  it('wraps storage failures without exposing stored content', async () => {
    const repository = new ChromeMigrationPreflightRepository({
      get: vi.fn(async () => {
        throw new Error('private raw content')
      }),
      set: vi.fn(async () => {}),
    })

    const error = await repository.read().catch((error: unknown) => error)

    expect(error).toBeInstanceOf(MigrationPreflightRecordError)
    expect(String(error)).not.toContain('private raw content')
  })
})

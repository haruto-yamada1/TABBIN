import { describe, expect, it, vi } from 'vitest'

import type {
  MigrationPreflightRepositoryPort,
  MigrationSourceFingerprintPort,
  StoredMigrationPreflight,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceCoordinationPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import {
  MIGRATION_SOURCE_KEYS,
  MigrationSourceReadError,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  RawLegacyStorageReaderPort,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { PersistenceStorageEstimatePort } from '@/lib/persistence/capacity'

import { MigrationPreflightService } from './MigrationPreflightService'

const createEmptySnapshot = (): RawLegacyStorageSnapshot =>
  Object.fromEntries(
    MIGRATION_SOURCE_KEYS.map((key) => [
      key,
      {
        status: 'present',
        value: key === 'activeAiChatConversationId' ? '' : [],
      },
    ]),
  ) as RawLegacyStorageSnapshot

class MemoryRepository implements MigrationPreflightRepositoryPort {
  record: StoredMigrationPreflight | undefined

  readonly read = vi.fn(async () => this.record)
  readonly save = vi.fn(async (record: StoredMigrationPreflight) => {
    this.record = record
  })
}

class RecordingCoordination implements PersistenceCoordinationPort {
  depth = 0
  readonly events: string[] = []

  readonly runExclusive = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    this.events.push('exclusive:start')
    this.depth += 1
    try {
      return await operation()
    } finally {
      this.depth -= 1
      this.events.push('exclusive:end')
    }
  }

  readonly runShared = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => operation()
}

const createService = (overrides?: {
  readonly fingerprints?: readonly string[]
  readonly estimateStorage?: PersistenceStorageEstimatePort
  readonly reader?: RawLegacyStorageReaderPort
  readonly repository?: MemoryRepository
}) => {
  const source = createEmptySnapshot()
  const reader =
    overrides?.reader ??
    ({
      readSnapshot: vi.fn(async () => source),
    } satisfies RawLegacyStorageReaderPort)
  const repository = overrides?.repository ?? new MemoryRepository()
  const coordination = new RecordingCoordination()
  const fingerprints = [...(overrides?.fingerprints ?? ['fp-a', 'fp-a'])]
  const fingerprint: MigrationSourceFingerprintPort = {
    create: vi.fn(async () => fingerprints.shift() ?? 'fp-a'),
  }
  const estimateStorage = vi.fn(async () => {
    expect(coordination.depth).toBe(0)
    coordination.events.push('analyze-and-estimate')
    return overrides?.estimateStorage
      ? overrides.estimateStorage()
      : { quota: 1_000_000, usage: 0 }
  })
  const service = new MigrationPreflightService({
    capacityPolicy: { minimumReserveBytes: 0, reserveRatio: 0 },
    coordination,
    estimateStorage,
    fingerprint,
    now: () => 123,
    rawReader: reader,
    repository,
  })
  return { coordination, fingerprint, reader, repository, service }
}

describe('MigrationPreflightService', () => {
  it('releases the exclusive barrier for pure analysis and stores a healthy result', async () => {
    const { coordination, repository, service } = createService()

    const result = await service.run()

    expect(result.status).toBe('healthy')
    expect(repository.record).toEqual(
      expect.objectContaining({
        checkedAt: 123,
        sourceFingerprint: 'fp-a',
        status: 'healthy',
      }),
    )
    expect(coordination.events).toEqual([
      'exclusive:start',
      'exclusive:end',
      'analyze-and-estimate',
      'exclusive:start',
      'exclusive:end',
    ])
  })

  it('stores stale instead of healthy when the source changes during analysis', async () => {
    const { repository, service } = createService({
      fingerprints: ['fp-before', 'fp-after'],
    })

    const result = await service.run()

    expect(result.status).toBe('stale')
    expect(repository.record).toEqual(
      expect.objectContaining({
        sourceFingerprint: 'fp-before',
        status: 'stale',
      }),
    )
  })

  it('blocks on detected identity collisions and exposes only aggregate diagnostics', async () => {
    const source = createEmptySnapshot()
    const reader: RawLegacyStorageReaderPort = {
      readSnapshot: vi.fn(async () => ({
        ...source,
        urls: {
          status: 'present' as const,
          value: [
            {
              id: 'duplicate',
              savedAt: 1,
              title: 'private first title',
              url: 'https://private.example/path',
            },
            {
              id: 'duplicate',
              savedAt: 2,
              title: 'private second title',
              url: 'https://private.example/path',
            },
          ],
        },
      })),
    }
    const { service } = createService({ reader })

    const result = await service.run()

    expect(result.status).toBe('blocked')
    if (result.status !== 'blocked') {
      throw new Error('expected blocked preflight')
    }
    expect(result.issueCodes).toEqual(
      expect.arrayContaining(['DUPLICATE_URL_ID', 'URL_IDENTITY_COLLISION']),
    )
    const diagnostic = JSON.stringify(result.diagnostic)
    expect(diagnostic).not.toContain('private.example')
    expect(diagnostic).not.toContain('private first title')
  })

  it('blocks warning findings that require an explicit migration policy', async () => {
    const source = createEmptySnapshot()
    const reader: RawLegacyStorageReaderPort = {
      readSnapshot: vi.fn(async () => ({
        ...source,
        customProjects: {
          status: 'present' as const,
          value: [{ id: 'project-1', name: 'Project', urlIds: [] }],
        },
      })),
    }
    const { service } = createService({ reader })

    const result = await service.run()

    expect(result).toEqual(
      expect.objectContaining({
        issueCodes: expect.arrayContaining(['MISSING_TIMESTAMP_PROVENANCE']),
        status: 'blocked',
      }),
    )
  })

  it('blocks capacity shortage with a typed code and keeps source read-only', async () => {
    const { reader, repository, service } = createService({
      estimateStorage: async () => ({ quota: 1, usage: 1 }),
    })

    const result = await service.run()

    expect(result).toEqual(
      expect.objectContaining({
        issueCodes: ['PERSISTENCE_QUOTA_EXCEEDED'],
        status: 'blocked',
      }),
    )
    expect(reader.readSnapshot).toHaveBeenCalledTimes(2)
    expect(repository.save).toHaveBeenCalledOnce()
  })

  it('converts a raw read failure into a typed blocked result', async () => {
    const reader: RawLegacyStorageReaderPort = {
      readSnapshot: vi.fn(async () => {
        throw new MigrationSourceReadError('MIGRATION_SOURCE_READ_FAILED')
      }),
    }
    const { service } = createService({ reader })

    const result = await service.run()

    expect(result).toEqual(
      expect.objectContaining({
        issueCodes: ['MIGRATION_SOURCE_READ_FAILED'],
        status: 'blocked',
      }),
    )
  })

  it('classifies an unreadable fingerprint as an invalid source type', async () => {
    const { fingerprint, service } = createService()
    vi.mocked(fingerprint.create).mockRejectedValueOnce(new TypeError('cycle'))

    const result = await service.run()

    expect(result).toEqual(
      expect.objectContaining({
        issueCodes: ['MIGRATION_SOURCE_INVALID_TYPE'],
        status: 'blocked',
      }),
    )
  })

  it('marks a persisted result stale when its source fingerprint no longer matches', async () => {
    const repository = new MemoryRepository()
    repository.record = {
      checkedAt: 100,
      diagnostic: {
        capacityStatus: 'ready',
        collisionCount: 0,
        entityCounts: {},
        issueCodes: [],
        preflightVersion: 1,
        sourceFingerprintVersion: 1,
      },
      sourceFingerprint: 'fp-before',
      status: 'healthy',
    }
    const { service } = createService({
      fingerprints: ['fp-after'],
      repository,
    })

    const result = await service.readStatus()

    expect(result.status).toBe('stale')
    expect(repository.record.status).toBe('stale')
  })

  it('keeps a source read failure blocked when rechecking a persisted result', async () => {
    const repository = new MemoryRepository()
    repository.record = {
      checkedAt: 100,
      diagnostic: {
        capacityStatus: 'ready',
        collisionCount: 0,
        entityCounts: {},
        issueCodes: [],
        preflightVersion: 1,
        sourceFingerprintVersion: 1,
      },
      sourceFingerprint: 'fp-before',
      status: 'healthy',
    }
    const reader: RawLegacyStorageReaderPort = {
      readSnapshot: vi.fn(async () => {
        throw new MigrationSourceReadError('MIGRATION_SOURCE_READ_FAILED')
      }),
    }
    const { service } = createService({ reader, repository })

    const result = await service.readStatus()

    expect(result).toEqual(
      expect.objectContaining({
        issueCodes: ['MIGRATION_SOURCE_READ_FAILED'],
        status: 'blocked',
      }),
    )
    expect(repository.record).toEqual(
      expect.objectContaining({
        sourceFingerprint: 'unavailable',
        status: 'blocked',
      }),
    )
  })

  it('returns an approval fingerprint only for a current healthy preflight', async () => {
    const { service } = createService()
    await service.run()

    await expect(service.readHealthySourceFingerprint()).resolves.toBe('fp-a')

    const stale = createService({ fingerprints: ['before', 'after'] })
    await stale.service.run()
    await expect(stale.service.readHealthySourceFingerprint()).rejects.toThrow(
      'MIGRATION_PREFLIGHT_STALE',
    )
  })

  it('creates a backup through the exclusive barrier without mutating storage', async () => {
    const { coordination, reader, service } = createService()

    const backup = await service.createCurrentDataBackup()

    expect(backup).toEqual(createEmptySnapshot())
    expect(reader.readSnapshot).toHaveBeenCalledOnce()
    expect(coordination.events).toEqual(['exclusive:start', 'exclusive:end'])
  })
})

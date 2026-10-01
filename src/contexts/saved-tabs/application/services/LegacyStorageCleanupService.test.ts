import { describe, expect, it, vi } from 'vitest'

import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type {
  LegacyStorageCleanupMetadata,
  LegacyStorageCleanupRepositoryPort,
} from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type {
  PersistenceControlState,
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2VerifiedMigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'

import {
  LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS,
  LegacyStorageCleanupService,
} from './LegacyStorageCleanupService'
import type { LegacyStorageCleanupError } from './LegacyStorageCleanupService'

const MIGRATION_ID = 'persistence-v2-production'
const RETENTION_STARTED_AT = 1_000

const indexedDbState: PersistenceControlState = {
  migrationId: MIGRATION_ID,
  persistenceGeneration: 2,
  status: 'indexeddb',
}

const emptySnapshot: PersistenceLogicalSnapshot = {
  analyticsViews: [],
  conversations: [],
  messages: [],
  revision: 1,
  savedTabs: {
    categories: [],
    collections: [],
    groups: [],
    memberships: [],
    urls: [],
  },
}

class InMemoryCleanupRepository implements LegacyStorageCleanupRepositoryPort {
  metadata: LegacyStorageCleanupMetadata | undefined
  readonly remainingKeys = new Set<string>(['urls', 'savedTabs'])
  removeError: Error | undefined
  retainKeyAfterRemove: string | undefined
  readonly savedMetadata: LegacyStorageCleanupMetadata[] = []

  constructor(metadata?: LegacyStorageCleanupMetadata) {
    this.metadata = metadata
  }

  readonly readMetadata = async (): Promise<
    LegacyStorageCleanupMetadata | undefined
  > => this.metadata

  readonly readRemainingLegacyKeys = async (): Promise<readonly string[]> => [
    ...this.remainingKeys,
  ]

  readonly removeLegacyDomainData = async (): Promise<void> => {
    if (this.removeError) {
      throw this.removeError
    }
    this.remainingKeys.clear()
    if (this.retainKeyAfterRemove) {
      this.remainingKeys.add(this.retainKeyAfterRemove)
    }
  }

  readonly saveMetadata = async (
    metadata: LegacyStorageCleanupMetadata,
  ): Promise<void> => {
    this.metadata = metadata
    this.savedMetadata.push(metadata)
  }
}

const createControlStateRepository = (
  state: PersistenceControlState,
): PersistenceControlStateRepositoryPort => ({
  read: vi.fn(async () => state),
  transition: vi.fn(async () => state),
})

const createCoordination = (): PersistenceCoordinationPort => ({
  runExclusive: async (operation) => operation(),
  runShared: async (operation) => operation(),
})

const createTarget = (): PersistenceV2VerifiedMigrationTargetPort => ({
  readVerifiedSnapshot: vi.fn(async () => emptySnapshot),
})

const createService = ({
  metadata,
  now = RETENTION_STARTED_AT,
  state = indexedDbState,
}: {
  readonly metadata?: LegacyStorageCleanupMetadata
  readonly now?: number
  readonly state?: PersistenceControlState
} = {}) => {
  const clock: ClockPort = { now: () => now }
  const repository = new InMemoryCleanupRepository(metadata)
  const target = createTarget()
  const service = new LegacyStorageCleanupService({
    clock,
    controlStateRepository: createControlStateRepository(state),
    coordination: createCoordination(),
    repository,
    target,
  })
  return { repository, service, target }
}

const retainedMetadata = (
  retentionStartedAt = RETENTION_STARTED_AT,
): LegacyStorageCleanupMetadata => ({
  migrationId: MIGRATION_ID,
  retentionStartedAt,
  status: 'retained',
  version: 1,
})

describe('LegacyStorageCleanupService', () => {
  it.each<PersistenceControlState>([
    { status: 'legacy' },
    { migrationId: MIGRATION_ID, status: 'migrating' },
    { migrationId: MIGRATION_ID, status: 'verifying' },
    { migrationId: MIGRATION_ID, status: 'cutover-pending' },
    {
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      migrationId: MIGRATION_ID,
      status: 'failed',
    },
  ])(
    'does not delete before verified IndexedDB cutover: $status',
    async (state) => {
      const { repository, service, target } = createService({ state })

      await expect(service.run()).resolves.toBe('skipped')

      expect(repository.metadata).toBeUndefined()
      expect(repository.remainingKeys).toEqual(new Set(['urls', 'savedTabs']))
      expect(target.readVerifiedSnapshot).not.toHaveBeenCalled()
    },
  )

  it('starts a per-user retention window on the first verified migration observation', async () => {
    const now = 9_999_999_999
    const { repository, service, target } = createService({ now })

    await expect(service.run()).resolves.toBe('retained')

    expect(repository.metadata).toStrictEqual({
      migrationId: MIGRATION_ID,
      retentionStartedAt: now,
      status: 'retained',
      version: 1,
    })
    expect(repository.remainingKeys).toEqual(new Set(['urls', 'savedTabs']))
    expect(target.readVerifiedSnapshot).not.toHaveBeenCalled()
  })

  it('retains legacy data before the per-user 30-day grace period ends', async () => {
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now: RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS - 1,
    })

    await expect(service.run()).resolves.toBe('retained')

    expect(repository.remainingKeys).toEqual(new Set(['urls', 'savedTabs']))
    expect(target.readVerifiedSnapshot).not.toHaveBeenCalled()
  })

  it('deletes at 30 days only after pre-delete and post-delete target verification', async () => {
    const completedAt =
      RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now: completedAt,
    })

    await expect(service.run()).resolves.toBe('completed')

    expect(target.readVerifiedSnapshot).toHaveBeenCalledTimes(2)
    expect(target.readVerifiedSnapshot).toHaveBeenNthCalledWith(1, MIGRATION_ID)
    expect(target.readVerifiedSnapshot).toHaveBeenNthCalledWith(2, MIGRATION_ID)
    expect(repository.remainingKeys).toEqual(new Set())
    expect(repository.savedMetadata).toStrictEqual([
      {
        migrationId: MIGRATION_ID,
        retentionStartedAt: RETENTION_STARTED_AT,
        status: 'eligible',
        version: 1,
      },
      {
        completedAt,
        migrationId: MIGRATION_ID,
        retentionStartedAt: RETENTION_STARTED_AT,
        status: 'completed',
        version: 1,
      },
    ])
  })

  it('fails closed without deletion when IndexedDB cannot be opened before cleanup', async () => {
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now: RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS,
    })
    vi.mocked(target.readVerifiedSnapshot).mockRejectedValueOnce(
      new Error('IndexedDB open failed'),
    )

    await expect(service.run()).rejects.toMatchObject({
      code: 'LEGACY_STORAGE_CLEANUP_TARGET_UNAVAILABLE',
    } satisfies Partial<LegacyStorageCleanupError>)

    expect(repository.remainingKeys).toEqual(new Set(['urls', 'savedTabs']))
    expect(repository.metadata).toMatchObject({ status: 'failed' })
  })

  it('fails closed before deletion when the current target is unhealthy', async () => {
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now: RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS,
    })
    vi.mocked(target.readVerifiedSnapshot).mockResolvedValueOnce({
      ...emptySnapshot,
      savedTabs: {
        ...emptySnapshot.savedTabs,
        memberships: [
          {
            addedAt: 1,
            collectionId: 'missing-collection',
            sortOrder: 1024,
            updatedAt: 1,
            urlId: 'missing-url',
          },
        ],
      },
    })

    await expect(service.run()).rejects.toMatchObject({
      code: 'LEGACY_STORAGE_CLEANUP_TARGET_UNHEALTHY',
    } satisfies Partial<LegacyStorageCleanupError>)

    expect(repository.remainingKeys).toEqual(new Set(['urls', 'savedTabs']))
    expect(repository.metadata).toMatchObject({ status: 'failed' })
  })

  it('fails closed when an allowlisted key remains after removal', async () => {
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now: RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS,
    })
    repository.retainKeyAfterRemove = 'urls'

    await expect(service.run()).rejects.toMatchObject({
      code: 'LEGACY_STORAGE_CLEANUP_KEYS_REMAIN',
    } satisfies Partial<LegacyStorageCleanupError>)

    expect(target.readVerifiedSnapshot).toHaveBeenCalledOnce()
    expect(repository.metadata).toMatchObject({ status: 'failed' })
  })

  it('retries safely after termination between deletion and completion', async () => {
    const now = RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS
    const { repository, service, target } = createService({
      metadata: retainedMetadata(),
      now,
    })
    vi.mocked(target.readVerifiedSnapshot)
      .mockResolvedValueOnce(emptySnapshot)
      .mockRejectedValueOnce(new Error('worker terminated'))

    await expect(service.run()).rejects.toMatchObject({
      code: 'LEGACY_STORAGE_CLEANUP_TARGET_UNAVAILABLE',
    } satisfies Partial<LegacyStorageCleanupError>)
    expect(repository.remainingKeys).toEqual(new Set())
    expect(repository.metadata).toMatchObject({ status: 'failed' })

    vi.mocked(target.readVerifiedSnapshot).mockResolvedValue(emptySnapshot)
    await expect(service.run()).resolves.toBe('completed')

    expect(repository.remainingKeys).toEqual(new Set())
    expect(repository.metadata).toMatchObject({ status: 'completed' })
  })

  it('is idempotent after completed cleanup', async () => {
    const completedAt =
      RETENTION_STARTED_AT + LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS
    const { repository, service, target } = createService({
      metadata: {
        completedAt,
        migrationId: MIGRATION_ID,
        retentionStartedAt: RETENTION_STARTED_AT,
        status: 'completed',
        version: 1,
      },
      now: completedAt + 1,
    })
    repository.remainingKeys.clear()

    await expect(service.run()).resolves.toBe('completed')

    expect(repository.savedMetadata).toEqual([])
    expect(target.readVerifiedSnapshot).not.toHaveBeenCalled()
  })
})

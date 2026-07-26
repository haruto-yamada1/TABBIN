import { describe, expect, it, vi } from 'vitest'

import { mapLegacyStorageToPersistenceV2 } from '@/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper'
import type {
  MigrationPreflightRepositoryPort,
  MigrationSourceFingerprintPort,
  StoredMigrationPreflight,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceV2MigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  RawLegacyStorageReaderPort,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import {
  PersistenceV2MigrationError,
  PersistenceV2MigrationService,
} from './PersistenceV2MigrationService'

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

const withSource = (
  source: RawLegacyStorageSnapshot,
  key: (typeof MIGRATION_SOURCE_KEYS)[number],
  value: unknown,
): RawLegacyStorageSnapshot => ({
  ...source,
  [key]: { status: 'present', value },
})

const createValidSource = (): RawLegacyStorageSnapshot => {
  let source = createEmptySnapshot()
  source = withSource(source, 'urls', [
    {
      id: 'url-1',
      savedAt: 10,
      title: 'Example',
      url: 'https://example.com',
    },
  ])
  source = withSource(source, 'savedTabs', [
    {
      domain: 'example.com',
      id: 'collection-1',
      urlIds: ['url-1'],
    },
  ])
  return source
}

const logicalSnapshot = (
  source: RawLegacyStorageSnapshot,
  revision = 1,
): PersistenceLogicalSnapshot => {
  const target = mapLegacyStorageToPersistenceV2(source).target
  return { ...target, revision }
}

const createTarget = (
  snapshot: PersistenceLogicalSnapshot,
): PersistenceV2MigrationTargetPort => ({
  markVerified: vi.fn(async () => undefined),
  markWritten: vi.fn(async () => undefined),
  prepare: vi.fn(async () => undefined),
  readSnapshot: vi.fn(async () => snapshot),
  writeBatch: vi.fn(async () => undefined),
})

const createService = ({
  currentFingerprint = 'fingerprint-a',
  preflightFingerprint = 'fingerprint-a',
  source = createValidSource(),
  targetSnapshot = logicalSnapshot(source),
}: {
  readonly currentFingerprint?: string
  readonly preflightFingerprint?: string
  readonly source?: RawLegacyStorageSnapshot
  readonly targetSnapshot?: PersistenceLogicalSnapshot
} = {}) => {
  const rawReader: RawLegacyStorageReaderPort = {
    readSnapshot: vi.fn(async () => source),
  }
  const fingerprint: MigrationSourceFingerprintPort = {
    create: vi.fn(async () => currentFingerprint),
  }
  const preflightRepository: MigrationPreflightRepositoryPort = {
    read: vi.fn(
      async (): Promise<StoredMigrationPreflight> => ({
        checkedAt: 1,
        diagnostic: {
          capacityStatus: 'ready',
          collisionCount: 0,
          entityCounts: {},
          issueCodes: [],
          preflightVersion: 1,
          sourceFingerprintVersion: 1,
        },
        sourceFingerprint: preflightFingerprint,
        status: 'healthy',
      }),
    ),
    save: vi.fn(async () => undefined),
  }
  const target = createTarget(targetSnapshot)
  const service = new PersistenceV2MigrationService({
    batchSize: 1,
    fingerprint,
    preflightRepository,
    rawReader,
    target,
  })
  return { service, target }
}

describe('PersistenceV2MigrationService', () => {
  it('maps before writing, replaces the target in bounded batches, and emits only a safe aggregate report', async () => {
    const source = createValidSource()
    const { service, target } = createService({ source })

    await service.migrate('migration-1')

    expect(target.prepare).toHaveBeenCalledWith('migration-1')
    expect(target.writeBatch).toHaveBeenCalledTimes(3)
    expect(target.markWritten).toHaveBeenCalledWith('migration-1')
    const report = service.readReport('migration-1')
    expect(report).toEqual(
      expect.objectContaining({
        collisionCount: 0,
        migratedCategoryCount: 0,
        migratedCollectionCount: 1,
        migratedGroupCount: 0,
        migratedMembershipCount: 1,
        migratedUrlCount: 1,
        migrationId: 'migration-1',
      }),
    )
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('example.com')
    expect(serialized).not.toContain('Example')
  })

  it('fails closed before touching IndexedDB when the dedicated mapper reports a blocking source issue', async () => {
    const source = withSource(createEmptySnapshot(), 'urls', [
      { id: 'url-1', savedAt: 1, title: 'Broken' },
    ])
    const { service, target } = createService({
      source,
      targetSnapshot: logicalSnapshot(createEmptySnapshot()),
    })

    await expect(service.migrate('migration-1')).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_BLOCKED',
    })

    expect(target.prepare).not.toHaveBeenCalled()
    expect(target.writeBatch).not.toHaveBeenCalled()
    expect(service.readFailureDiagnostic()).toEqual(
      expect.objectContaining({
        errorCode: 'MIGRATION_SOURCE_BLOCKED',
        issueCodes: ['MIGRATION_SOURCE_INVALID_TYPE'],
        migrationId: 'migration-1',
        sourceBytes: expect.any(Number),
        stage: 'source-map',
      }),
    )
    expect(JSON.stringify(service.readFailureDiagnostic())).not.toContain(
      'Broken',
    )
  })

  it('rechecks fingerprint B during verification and never publishes a changed source', async () => {
    const { service, target } = createService({
      currentFingerprint: 'fingerprint-b',
      preflightFingerprint: 'fingerprint-a',
    })

    await expect(service.verify('migration-1')).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_CHANGED',
    })

    expect(target.readSnapshot).not.toHaveBeenCalled()
    expect(target.markVerified).not.toHaveBeenCalled()
  })

  it('retains aggregate source evidence when bootstrap detects a stale preflight fingerprint', async () => {
    const { service } = createService({
      currentFingerprint: 'fingerprint-b',
      preflightFingerprint: 'fingerprint-a',
    })

    await service.readCurrentSourceFingerprint()
    await service.readPreflightSourceFingerprint('migration-1')

    expect(service.readFailureDiagnostic()).toEqual(
      expect.objectContaining({
        errorCode: 'MIGRATION_SOURCE_CHANGED',
        migrationId: 'migration-1',
        sourceBytes: expect.any(Number),
        sourceEntityCounts: expect.objectContaining({ urls: 1 }),
        stage: 'preflight',
      }),
    )
  })

  it('performs semantic read-back verification before marking the target verified', async () => {
    const source = createValidSource()
    const expected = logicalSnapshot(source)
    const actual: PersistenceLogicalSnapshot = {
      ...expected,
      savedTabs: { ...expected.savedTabs, memberships: [] },
    }
    const { service, target } = createService({
      source,
      targetSnapshot: actual,
    })

    const verification = service.verify('migration-1')
    await expect(verification).rejects.toMatchObject({
      code: 'MIGRATION_SEMANTIC_VERIFICATION_FAILED',
    })
    await expect(verification).rejects.toBeInstanceOf(
      PersistenceV2MigrationError,
    )

    expect(target.markVerified).not.toHaveBeenCalled()
  })

  it('verifies semantically equal snapshots with code-point ordering and publishes a report', async () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'ab',
        savedAt: 10,
        title: 'First',
        url: 'https://first.example.com',
      },
      {
        id: 'a\u0000b',
        savedAt: 20,
        title: 'Second',
        url: 'https://second.example.com',
      },
    ])
    const expected = logicalSnapshot(source)
    const targetSnapshot: PersistenceLogicalSnapshot = {
      ...expected,
      savedTabs: {
        ...expected.savedTabs,
        urls: expected.savedTabs.urls.toReversed(),
      },
    }
    const { service, target } = createService({ source, targetSnapshot })

    await service.verify('migration-1')

    expect(target.markVerified).toHaveBeenCalledWith('migration-1')
    expect(service.readFailureDiagnostic()).toBeUndefined()
    expect(service.readReport('migration-1')).toEqual(
      expect.objectContaining({
        migratedUrlCount: 2,
        migrationId: 'migration-1',
      }),
    )
  })

  it('clears an obsolete verification diagnostic after a successful retry', async () => {
    const source = createValidSource()
    const expected = logicalSnapshot(source)
    const { service, target } = createService({ source })
    vi.mocked(target.readSnapshot)
      .mockResolvedValueOnce({
        ...expected,
        savedTabs: { ...expected.savedTabs, memberships: [] },
      })
      .mockResolvedValue(expected)

    await expect(service.verify('migration-1')).rejects.toMatchObject({
      code: 'MIGRATION_SEMANTIC_VERIFICATION_FAILED',
    })
    expect(service.readFailureDiagnostic()).toBeDefined()

    await service.verify('migration-1')

    expect(service.readFailureDiagnostic()).toBeUndefined()
  })

  it('discards and deterministically replays a partial target on retry', async () => {
    const { service, target } = createService()
    vi.mocked(target.writeBatch)
      .mockRejectedValueOnce(new Error('commit interrupted'))
      .mockResolvedValue(undefined)

    await expect(service.migrate('migration-1')).rejects.toMatchObject({
      code: 'MIGRATION_TARGET_WRITE_FAILED',
    })
    const firstAttemptPlans = vi
      .mocked(target.writeBatch)
      .mock.calls.map(([, plan]) => plan)
    await service.migrate('migration-1')

    expect(target.prepare).toHaveBeenCalledTimes(2)
    expect(target.markWritten).toHaveBeenCalledTimes(1)
    expect(
      vi
        .mocked(target.writeBatch)
        .mock.calls.slice(
          firstAttemptPlans.length,
          firstAttemptPlans.length * 2,
        )
        .map(([, plan]) => plan),
    ).toStrictEqual(firstAttemptPlans)
    expect(service.readFailureDiagnostic()).toBeUndefined()
  })
})

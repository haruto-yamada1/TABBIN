import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import type {
  PersistenceChangeEvent,
  PersistenceRecoverySnapshotRecord,
  PersistenceRecoverySnapshotRepositoryPort,
  PersistenceRecoverySnapshotSummary,
} from '@/contexts/saved-tabs/public-api'
import {
  BACKUP_RECOVERY_RETENTION_POLICY,
  BACKUP_RESOURCE_LIMITS,
} from '@/lib/persistence/backupResourcePolicy'

import { BackupMapper } from './BackupMapper'
import { inspectBackupV2 } from './BackupV2Inspector'
import { BackupDataV2Schema } from './BackupV2Schema'
import {
  PreImportRecoverySnapshotError,
  createPreImportRecoverySnapshotService,
} from './PreImportRecoverySnapshotService'
import type {
  PreImportRecoverySnapshotServiceDeps,
  RecoverySnapshotService,
} from './PreImportRecoverySnapshotService'

const inspection = inspectBackupV2(
  readFileSync(
    new URL('fixtures/backup-v2-current.json', import.meta.url),
    'utf8',
  ),
  { importDate: '2026-07-29' },
)

const logicalSnapshot = BackupMapper.toLogicalSnapshot(inspection.data, 12)

const createWarningOnlySnapshot = (revision = 12) => ({
  ...structuredClone(logicalSnapshot),
  revision,
  savedTabs: {
    ...structuredClone(logicalSnapshot.savedTabs),
    urls: [
      ...structuredClone(logicalSnapshot.savedTabs.urls),
      {
        firstSavedAt: 2,
        id: 'url-orphan',
        lastSavedAt: 2,
        normalizedUrl: 'https://orphan.example.test/',
        title: 'Orphan URL',
        updatedAt: 2,
        url: 'https://orphan.example.test/',
      },
    ],
  },
})

const createSummary = (
  overrides: Partial<PersistenceRecoverySnapshotSummary> = {},
): PersistenceRecoverySnapshotSummary => ({
  createdAt: 1_000,
  expiresAt: 604_801_000,
  id: '00000000-0000-4000-8000-000000000740',
  serializedBytes: 1_024,
  sourceRevision: 12,
  ...overrides,
})

const createRecord = (
  overrides: Partial<PersistenceRecoverySnapshotRecord> = {},
): PersistenceRecoverySnapshotRecord => ({
  ...createSummary(),
  backupSchemaVersion: 2,
  data: structuredClone(inspection.data),
  ...overrides,
})

type Deps = PreImportRecoverySnapshotServiceDeps & {
  readonly publishedEvents: PersistenceChangeEvent[]
  readonly repository: PersistenceRecoverySnapshotRepositoryPort
}

const createDeps = (
  overrides: Partial<PreImportRecoverySnapshotServiceDeps> = {},
): Deps => {
  const publishedEvents: PersistenceChangeEvent[] = []
  const records = new Map<string, PersistenceRecoverySnapshotRecord>()
  const repository: PersistenceRecoverySnapshotRepositoryPort = {
    findAvailableById: vi.fn(async (id, now) => {
      const record = records.get(id)
      return record && record.expiresAt > now
        ? structuredClone(record)
        : undefined
    }),
    listAvailable: vi.fn(async (now) =>
      [...records.values()]
        .filter(({ expiresAt }) => expiresAt > now)
        .map(({ data: _data, backupSchemaVersion: _version, ...summary }) =>
          structuredClone(summary),
        ),
    ),
    saveWithRetention: vi.fn(async (record) => {
      records.set(record.id, structuredClone(record))
      return {
        revision: record.sourceRevision + 1,
        snapshot: createSummary(record),
      }
    }),
  }

  return {
    changePort: {
      publish: vi.fn(async (event) => {
        publishedEvents.push(structuredClone(event))
      }),
      subscribe: vi.fn(() => () => {}),
    },
    clock: { now: vi.fn(() => 1_000) },
    estimateStorage: vi.fn(async () => ({
      quota: 512 * 1024 * 1024,
      usage: 0,
    })),
    idGenerator: {
      generate: vi.fn(() => '00000000-0000-4000-8000-000000000740'),
    },
    publishedEvents,
    readUserSettings: vi.fn(async () =>
      structuredClone(inspection.data.userSettings),
    ),
    replacement: {
      replaceAll: vi.fn(async () => ({ revision: 13 })),
    },
    repository,
    snapshotReader: {
      readConsistentSnapshot: vi.fn(async () =>
        structuredClone(logicalSnapshot),
      ),
    },
    writeUserSettings: vi.fn(async () => undefined),
    ...overrides,
  }
}

const captureError = async (
  action: () => Promise<unknown>,
): Promise<PreImportRecoverySnapshotError> => {
  try {
    await action()
  } catch (error) {
    if (error instanceof PreImportRecoverySnapshotError) {
      return error
    }
  }
  throw new Error('Expected PreImportRecoverySnapshotError')
}

const createService = (
  overrides: Partial<PreImportRecoverySnapshotServiceDeps> = {},
): { readonly deps: Deps; readonly service: RecoverySnapshotService } => {
  const deps = createDeps(overrides)
  return {
    deps,
    service: createPreImportRecoverySnapshotService(deps),
  }
}

describe('createPreImportRecoverySnapshotService', () => {
  it('captures the current logical Backup V2 data before publishing a content-free lifecycle event', async () => {
    const snapshotId = '00000000-0000-4000-8000-000000000740'
    const changeId = '00000000-0000-4000-8000-000000000741'
    const { deps, service } = createService({
      idGenerator: {
        generate: vi
          .fn()
          .mockReturnValueOnce(snapshotId)
          .mockReturnValueOnce(changeId),
      },
    })

    const result = await service.captureBeforeOverwrite()
    const id = result.id

    expect(result).toMatchObject({
      id: snapshotId,
      notification: {
        kind: 'committed_and_published',
      },
      revision: 13,
    })
    expect(deps.repository.saveWithRetention).toHaveBeenCalledOnce()
    const [record, policy] = vi.mocked(deps.repository.saveWithRetention).mock
      .calls[0] ?? [undefined, undefined]
    expect(record).toMatchObject({
      backupSchemaVersion: 2,
      createdAt: 1_000,
      expiresAt: 604_801_000,
      id,
      sourceRevision: 12,
    })
    expect(record?.data).toEqual(inspection.data)
    expect(record?.serializedBytes).toBeGreaterThan(0)
    expect(record?.serializedBytes).toBeLessThanOrEqual(
      BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
    )
    expect(policy).toEqual({
      ...BACKUP_RECOVERY_RETENTION_POLICY,
      now: 1_000,
    })
    expect(deps.publishedEvents).toEqual([
      {
        changeId,
        revision: 13,
        scopes: ['recoverySnapshots'],
      },
    ])
    expect(JSON.stringify(deps.publishedEvents)).not.toContain('example.test')
  })

  it('returns typed partial success when recovery persistence commits but notification fails', async () => {
    const { service } = createService({
      changePort: {
        publish: vi.fn(async () => {
          throw new Error('transport unavailable')
        }),
        subscribe: vi.fn(() => () => {}),
      },
    })

    await expect(service.captureBeforeOverwrite()).resolves.toMatchObject({
      id: '00000000-0000-4000-8000-000000000740',
      notification: {
        diagnostic: {
          code: 'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT',
          revision: 13,
          scopes: ['recoverySnapshots'],
          stage: 'change_publication',
        },
        kind: 'commit_succeeded_notification_failed',
      },
      revision: 13,
    })
  })

  it('fails closed before persistence when capacity preflight is blocked', async () => {
    const { deps, service } = createService({
      estimateStorage: vi.fn(async () => ({ quota: 1, usage: 1 })),
    })

    const error = await captureError(service.captureBeforeOverwrite)

    expect(error.code).toBe('RECOVERY_CAPACITY_BLOCKED')
    expect(deps.repository.saveWithRetention).not.toHaveBeenCalled()
    expect(deps.changePort.publish).not.toHaveBeenCalled()
  })

  it('fails closed before persistence when the current logical graph is unhealthy', async () => {
    const brokenSnapshot = {
      ...structuredClone(logicalSnapshot),
      savedTabs: {
        ...structuredClone(logicalSnapshot.savedTabs),
        memberships: [
          {
            addedAt: 1,
            collectionId: 'missing-collection',
            sortOrder: 1,
            updatedAt: 1,
            urlId: 'missing-url',
          },
        ],
      },
    }
    const { deps, service } = createService({
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => brokenSnapshot),
      },
    })

    const error = await captureError(service.captureBeforeOverwrite)

    expect(error.code).toBe('RECOVERY_SOURCE_INTEGRITY_FAILED')
    expect(deps.repository.saveWithRetention).not.toHaveBeenCalled()
  })

  it('captures a warning-only logical graph for overwrite recovery', async () => {
    const warningOnlySnapshot = createWarningOnlySnapshot()
    const { deps, service } = createService({
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => warningOnlySnapshot),
      },
    })

    await expect(service.captureBeforeOverwrite()).resolves.toMatchObject({
      id: '00000000-0000-4000-8000-000000000740',
    })
    expect(deps.repository.saveWithRetention).toHaveBeenCalledOnce()
  })

  it('lists only repository-approved, non-expired recovery points', async () => {
    const summary = createSummary()
    const { deps, service } = createService()
    vi.mocked(deps.repository.listAvailable).mockResolvedValue([summary])

    await expect(service.listAvailable()).resolves.toEqual([summary])
    expect(deps.repository.listAvailable).toHaveBeenCalledWith(1_000)
  })

  it('restores through one replacement, verifies readback, and then publishes all invalidation scopes', async () => {
    const record = createRecord()
    const data = BackupDataV2Schema.parse(record.data)
    const restoredSnapshot = BackupMapper.toLogicalSnapshot(data, 13)
    const { deps, service } = createService({
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => restoredSnapshot),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    await expect(service.restore(record.id)).resolves.toMatchObject({
      notification: {
        kind: 'committed_and_published',
      },
      revision: 13,
    })

    expect(deps.replacement.replaceAll).toHaveBeenCalledWith({
      analyticsViews: data.analyticsViews,
      conversations: data.conversations,
      messages: data.messages,
      savedTabs: data.savedTabs,
    })
    expect(deps.writeUserSettings).toHaveBeenCalledWith(data.userSettings)
    expect(deps.publishedEvents.at(-1)).toEqual({
      changeId: '00000000-0000-4000-8000-000000000740',
      revision: 13,
      scopes: [
        'analyticsViews',
        'categories',
        'collections',
        'conversations',
        'groups',
        'memberships',
        'recoverySnapshots',
        'urls',
      ],
    })
  })

  it('restores and verifies a warning-only recovery snapshot', async () => {
    const warningOnlySnapshot = createWarningOnlySnapshot(13)
    const warningOnlyData = BackupMapper.toBackupData(
      warningOnlySnapshot,
      inspection.data.userSettings,
    )
    const record = createRecord({ data: warningOnlyData })
    const { deps, service } = createService({
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => warningOnlySnapshot),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    await expect(service.restore(record.id)).resolves.toMatchObject({
      revision: 13,
    })
    expect(deps.replacement.replaceAll).toHaveBeenCalledOnce()
  })

  it('persists the current state before a user-initiated restore starts', async () => {
    const record = createRecord()
    const restoredSnapshot = BackupMapper.toLogicalSnapshot(
      BackupDataV2Schema.parse(record.data),
      13,
    )
    const { deps, service } = createService({
      snapshotReader: {
        readConsistentSnapshot: vi
          .fn()
          .mockResolvedValueOnce(logicalSnapshot)
          .mockResolvedValueOnce(restoredSnapshot),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    await service.restore(record.id, { captureCurrent: true })

    expect(deps.repository.saveWithRetention).toHaveBeenCalledOnce()
    const saveOrder = vi.mocked(deps.repository.saveWithRetention).mock
      .invocationCallOrder[0]
    const replacementOrder = vi.mocked(deps.replacement.replaceAll).mock
      .invocationCallOrder[0]
    if (saveOrder === undefined || replacementOrder === undefined) {
      throw new Error('Expected both recovery operations to run')
    }
    expect(saveOrder).toBeLessThan(replacementOrder)
  })

  it('rejects an expired or missing recovery point before mutation', async () => {
    const { deps, service } = createService()

    const error = await captureError(async () =>
      service.restore('missing-recovery'),
    )

    expect(error.code).toBe('RECOVERY_SNAPSHOT_NOT_FOUND')
    expect(deps.replacement.replaceAll).not.toHaveBeenCalled()
    expect(deps.writeUserSettings).not.toHaveBeenCalled()
  })

  it('leaves settings and notifications untouched when the restore transaction fails', async () => {
    const record = createRecord()
    const { deps, service } = createService({
      replacement: {
        replaceAll: vi.fn(async () => {
          throw new Error('transaction aborted')
        }),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    const error = await captureError(async () => service.restore(record.id))

    expect(error.code).toBe('RECOVERY_REPLACEMENT_FAILED')
    expect(deps.writeUserSettings).not.toHaveBeenCalled()
    expect(deps.changePort.publish).not.toHaveBeenCalled()
  })

  it('compensates to the pre-restore state when the separate settings write fails', async () => {
    const record = createRecord()
    const previousSettings = {
      ...inspection.data.userSettings,
      showSavedTime: true,
    }
    const compensatedSnapshot = {
      ...structuredClone(logicalSnapshot),
      revision: 14,
    }
    const { deps, service } = createService({
      readUserSettings: vi
        .fn()
        .mockResolvedValueOnce(previousSettings)
        .mockResolvedValueOnce(previousSettings),
      replacement: {
        replaceAll: vi
          .fn()
          .mockResolvedValueOnce({ revision: 13 })
          .mockResolvedValueOnce({ revision: 14 }),
      },
      snapshotReader: {
        readConsistentSnapshot: vi
          .fn()
          .mockResolvedValueOnce(logicalSnapshot)
          .mockResolvedValueOnce(compensatedSnapshot),
      },
      writeUserSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockResolvedValueOnce(undefined),
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    const error = await captureError(async () => service.restore(record.id))

    expect(error).toMatchObject({
      code: 'RECOVERY_SETTINGS_WRITE_FAILED',
      compensation: {
        revision: 14,
      },
    })
    expect(deps.replacement.replaceAll).toHaveBeenCalledTimes(2)
    expect(deps.writeUserSettings).toHaveBeenNthCalledWith(2, previousSettings)
    expect(deps.publishedEvents.at(-1)).toMatchObject({ revision: 14 })
  })

  it('reports a fixed compensation failure when the pre-restore state cannot be re-established', async () => {
    const record = createRecord()
    const { deps, service } = createService({
      replacement: {
        replaceAll: vi
          .fn()
          .mockResolvedValueOnce({ revision: 13 })
          .mockRejectedValueOnce(new Error('compensation transaction aborted')),
      },
      writeUserSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('settings unavailable')),
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    const error = await captureError(async () => service.restore(record.id))

    expect(error.code).toBe('RECOVERY_COMPENSATION_FAILED')
    expect(error.message).not.toContain('transaction aborted')
    expect(deps.replacement.replaceAll).toHaveBeenCalledTimes(2)
    expect(deps.changePort.publish).not.toHaveBeenCalled()
  })

  it('compensates to the pre-restore state when restored readback differs from the saved snapshot', async () => {
    const record = createRecord()
    const restoredSnapshot = BackupMapper.toLogicalSnapshot(
      BackupDataV2Schema.parse(record.data),
      13,
    )
    const mismatched = {
      ...restoredSnapshot,
      savedTabs: {
        ...restoredSnapshot.savedTabs,
        urls: [
          {
            firstSavedAt: 1,
            id: 'unexpected-url',
            lastSavedAt: 1,
            normalizedUrl: 'https://mismatch.example.test/',
            title: 'mismatch',
            updatedAt: 1,
            url: 'https://mismatch.example.test/',
          },
        ],
      },
    }
    const previousSettings = {
      ...inspection.data.userSettings,
      showSavedTime: true,
    }
    const { deps, service } = createService({
      readUserSettings: vi
        .fn()
        .mockResolvedValueOnce(previousSettings)
        .mockResolvedValueOnce(inspection.data.userSettings)
        .mockResolvedValueOnce(previousSettings),
      replacement: {
        replaceAll: vi
          .fn()
          .mockResolvedValueOnce({ revision: 13 })
          .mockResolvedValueOnce({ revision: 14 }),
      },
      snapshotReader: {
        readConsistentSnapshot: vi
          .fn()
          .mockResolvedValueOnce(logicalSnapshot)
          .mockResolvedValueOnce(mismatched)
          .mockResolvedValueOnce({
            ...structuredClone(logicalSnapshot),
            revision: 14,
          }),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    const error = await captureError(async () => service.restore(record.id))

    expect(error).toMatchObject({
      code: 'RECOVERY_READBACK_MISMATCH',
      compensation: {
        revision: 14,
      },
    })
    expect(deps.replacement.replaceAll).toHaveBeenCalledTimes(2)
    expect(deps.writeUserSettings).toHaveBeenNthCalledWith(2, previousSettings)
    expect(deps.publishedEvents.at(-1)).toMatchObject({ revision: 14 })
  })

  it('returns typed partial success when restore commits but notification fails', async () => {
    const record = createRecord()
    const restoredSnapshot = BackupMapper.toLogicalSnapshot(
      BackupDataV2Schema.parse(record.data),
      13,
    )
    const { deps, service } = createService({
      changePort: {
        publish: vi.fn(async () => {
          throw new Error('transport unavailable')
        }),
        subscribe: vi.fn(() => () => {}),
      },
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => restoredSnapshot),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    await expect(service.restore(record.id)).resolves.toMatchObject({
      notification: {
        diagnostic: {
          code: 'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT',
          revision: 13,
          scopes: expect.arrayContaining(['collections', 'recoverySnapshots']),
          stage: 'change_publication',
        },
        kind: 'commit_succeeded_notification_failed',
      },
      revision: 13,
    })
  })

  it('never copies private recovery content into typed errors', async () => {
    const record = createRecord()
    const { deps, service } = createService({
      replacement: {
        replaceAll: vi.fn(async () => {
          throw new Error(JSON.stringify(record.data))
        }),
      },
    })
    vi.mocked(deps.repository.findAvailableById).mockResolvedValue(record)

    const error = await captureError(async () => service.restore(record.id))

    expect(error.code).toBe('RECOVERY_REPLACEMENT_FAILED')
    expect(error.message).not.toContain('example.test')
    expect(JSON.stringify(error)).not.toContain('example.test')
  })
})

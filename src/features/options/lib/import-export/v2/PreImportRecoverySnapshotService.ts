import type {
  ClockPort,
  IdGeneratorPort,
  PersistenceChangePort,
  PersistenceChangeScope,
  PersistenceLogicalSnapshot,
  PersistenceNotificationFailureDiagnostic,
  PersistenceNotificationFailureStage,
  PersistenceRecoverySnapshotRecord,
  PersistenceRecoverySnapshotRepositoryPort,
  PersistenceRecoverySnapshotSummary,
  PersistenceV2ReplacementPort,
  PersistenceV2ReplacementTarget,
} from '@/contexts/saved-tabs/public-api'
import {
  checkPersistenceIntegrity,
  hasBlockingPersistenceIntegrityIssues,
  PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE,
} from '@/contexts/saved-tabs/public-api'
import {
  BACKUP_RECOVERY_RETENTION_POLICY,
  BACKUP_RESOURCE_LIMITS,
} from '@/lib/persistence/backupResourcePolicy'
import {
  measureSerializedBytes,
  runPersistenceCapacityPreflight,
} from '@/lib/persistence/capacity'
import type { PersistenceStorageEstimatePort } from '@/lib/persistence/capacity'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import type { JsonValue } from '@/lib/persistence/jsonValue'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import { collectBackupV2ResourceUsage } from './BackupV2ResourceUsage'
import { BACKUP_V2_SCHEMA_VERSION, BackupDataV2Schema } from './BackupV2Schema'
import type { BackupDataV2 } from './BackupV2Schema'

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1_000
const MILLISECONDS_PER_DAY =
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND
const KIBIBYTE = 1_024

export const RECOVERY_CAPACITY_MINIMUM_RESERVE_BYTES = KIBIBYTE * KIBIBYTE
export const RECOVERY_CAPACITY_RESERVE_RATIO = 0.2

const RESTORE_CHANGE_SCOPES = [
  'analyticsViews',
  'categories',
  'collections',
  'conversations',
  'groups',
  'memberships',
  'recoverySnapshots',
  'urls',
] as const satisfies readonly PersistenceChangeScope[]

export type PreImportRecoverySnapshotErrorCode =
  | 'RECOVERY_CAPACITY_BLOCKED'
  | 'RECOVERY_COMPENSATION_FAILED'
  | 'RECOVERY_PERSIST_FAILED'
  | 'RECOVERY_READBACK_FAILED'
  | 'RECOVERY_READBACK_MISMATCH'
  | 'RECOVERY_REPLACEMENT_FAILED'
  | 'RECOVERY_SETTINGS_WRITE_FAILED'
  | 'RECOVERY_SNAPSHOT_INVALID'
  | 'RECOVERY_SNAPSHOT_NOT_FOUND'
  | 'RECOVERY_SOURCE_INTEGRITY_FAILED'
  | 'RECOVERY_SOURCE_INVALID'

const ERROR_MESSAGES = {
  RECOVERY_CAPACITY_BLOCKED:
    'Storage capacity is insufficient for a recovery snapshot.',
  RECOVERY_COMPENSATION_FAILED:
    'The pre-restore state could not be re-established.',
  RECOVERY_PERSIST_FAILED: 'The recovery snapshot could not be persisted.',
  RECOVERY_READBACK_FAILED: 'The restored data could not be read back.',
  RECOVERY_READBACK_MISMATCH:
    'The restored data did not match the recovery snapshot.',
  RECOVERY_REPLACEMENT_FAILED: 'The recovery replacement transaction failed.',
  RECOVERY_SETTINGS_WRITE_FAILED:
    'The recovery settings write could not be completed.',
  RECOVERY_SNAPSHOT_INVALID: 'The recovery snapshot is invalid.',
  RECOVERY_SNAPSHOT_NOT_FOUND: 'The recovery snapshot is unavailable.',
  RECOVERY_SOURCE_INTEGRITY_FAILED:
    'The current persistence state failed its integrity check.',
  RECOVERY_SOURCE_INVALID:
    'The current persistence state cannot become a recovery snapshot.',
} as const satisfies Record<PreImportRecoverySnapshotErrorCode, string>

export class PreImportRecoverySnapshotError extends Error {
  readonly code: PreImportRecoverySnapshotErrorCode
  readonly compensation?: RecoverySnapshotCompensation

  constructor(
    code: PreImportRecoverySnapshotErrorCode,
    compensation?: RecoverySnapshotCompensation,
  ) {
    super(ERROR_MESSAGES[code])
    this.code = code
    if (compensation !== undefined) {
      this.compensation = compensation
    }
    this.name = 'PreImportRecoverySnapshotError'
  }
}

export type PreImportRecoverySnapshotServiceDeps = {
  readonly changePort: PersistenceChangePort
  readonly clock: ClockPort
  readonly estimateStorage: PersistenceStorageEstimatePort
  readonly idGenerator: IdGeneratorPort
  readonly readUserSettings: () => Promise<UserSettings>
  readonly replacement: PersistenceV2ReplacementPort
  readonly repository: PersistenceRecoverySnapshotRepositoryPort
  readonly snapshotReader: {
    readonly readConsistentSnapshot: () => Promise<PersistenceLogicalSnapshot>
  }
  readonly writeUserSettings: (settings: UserSettings) => Promise<void>
}

export type RecoverySnapshotNotificationOutcome =
  | {
      readonly event: {
        readonly changeId: string
        readonly revision: number
        readonly scopes: readonly PersistenceChangeScope[]
      }
      readonly kind: 'committed_and_published'
    }
  | {
      readonly diagnostic: PersistenceNotificationFailureDiagnostic
      readonly kind: 'commit_succeeded_notification_failed'
    }

export type RecoverySnapshotCaptureResult = {
  readonly id: string
  readonly notification: RecoverySnapshotNotificationOutcome
  readonly revision: number
}

export type RecoverySnapshotRestoreResult = {
  readonly notification: RecoverySnapshotNotificationOutcome
  readonly revision: number
}

export type RecoverySnapshotCompensation = RecoverySnapshotRestoreResult

export type RecoverySnapshotService = {
  readonly captureBeforeOverwrite: () => Promise<RecoverySnapshotCaptureResult>
  readonly listAvailable: () => Promise<
    readonly PersistenceRecoverySnapshotSummary[]
  >
  readonly restore: (
    id: string,
    options?: { readonly captureCurrent?: boolean },
  ) => Promise<RecoverySnapshotRestoreResult>
}

const createReplacementTarget = (
  logicalSnapshot: PersistenceLogicalSnapshot,
): PersistenceV2ReplacementTarget => ({
  analyticsViews: logicalSnapshot.analyticsViews,
  conversations: logicalSnapshot.conversations,
  messages: logicalSnapshot.messages,
  savedTabs: logicalSnapshot.savedTabs,
})

const createEntityCounts = (data: BackupDataV2) => {
  const usage = collectBackupV2ResourceUsage(data, measureSerializedBytes(data))
  return {
    analyticsViews: usage.analyticsViews,
    attachments: usage.attachments,
    categories: usage.categories,
    collections: usage.collections,
    conversations: usage.conversations,
    groups: usage.groups,
    memberships: usage.memberships,
    messages: usage.messages,
    settings: 1,
    urls: usage.urls,
  }
}

const toRecoveryData = (
  snapshot: PersistenceLogicalSnapshot,
  userSettings: UserSettings,
): {
  readonly data: BackupDataV2 & JsonValue
  readonly serializedBytes: number
} => {
  let data: BackupDataV2
  try {
    data = BackupDataV2Schema.parse(
      BackupMapper.toBackupData(snapshot, userSettings),
    )
  } catch {
    throw new PreImportRecoverySnapshotError('RECOVERY_SOURCE_INVALID')
  }
  if (!isJsonValue(data)) {
    throw new PreImportRecoverySnapshotError('RECOVERY_SOURCE_INVALID')
  }
  return {
    data,
    serializedBytes: measureSerializedBytes(data),
  }
}

const parseRecoveryData = (
  record: PersistenceRecoverySnapshotRecord,
): BackupDataV2 => {
  if (record.backupSchemaVersion !== BACKUP_V2_SCHEMA_VERSION) {
    throw new PreImportRecoverySnapshotError('RECOVERY_SNAPSHOT_INVALID')
  }
  const result = BackupDataV2Schema.safeParse(record.data)
  if (!result.success) {
    throw new PreImportRecoverySnapshotError('RECOVERY_SNAPSHOT_INVALID')
  }
  return result.data
}

const assertMatchingReadback = (
  data: BackupDataV2,
  snapshot: PersistenceLogicalSnapshot,
  settings: UserSettings,
  revision: number,
): void => {
  if (
    snapshot.revision !== revision ||
    hasBlockingPersistenceIntegrityIssues(
      checkPersistenceIntegrity(snapshot.savedTabs),
    )
  ) {
    throw new PreImportRecoverySnapshotError('RECOVERY_READBACK_MISMATCH')
  }

  try {
    const readbackData = BackupMapper.toBackupData(snapshot, settings)
    if (JSON.stringify(readbackData) !== JSON.stringify(data)) {
      throw new PreImportRecoverySnapshotError('RECOVERY_READBACK_MISMATCH')
    }
  } catch (error) {
    if (error instanceof PreImportRecoverySnapshotError) {
      throw error
    }
    throw new PreImportRecoverySnapshotError('RECOVERY_READBACK_MISMATCH')
  }
}

const createNotificationFailure = (
  revision: number,
  scopes: readonly PersistenceChangeScope[],
  stage: PersistenceNotificationFailureStage,
): RecoverySnapshotNotificationOutcome => ({
  diagnostic: {
    code: PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE,
    revision,
    scopes,
    stage,
  },
  kind: 'commit_succeeded_notification_failed',
})

const publishPostCommitNotification = async ({
  changePort,
  idGenerator,
  revision,
  scopes,
}: {
  readonly changePort: PersistenceChangePort
  readonly idGenerator: IdGeneratorPort
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
}): Promise<RecoverySnapshotNotificationOutcome> => {
  let changeId: string
  try {
    changeId = idGenerator.generate()
  } catch {
    return createNotificationFailure(revision, scopes, 'change_id_generation')
  }

  const event = {
    changeId,
    revision,
    scopes,
  }
  try {
    await changePort.publish(event)
  } catch {
    return createNotificationFailure(revision, scopes, 'change_publication')
  }
  return {
    event,
    kind: 'committed_and_published',
  }
}

type RestoreState = {
  readonly settings: UserSettings
  readonly snapshot: PersistenceLogicalSnapshot
}

const matchesRestoreState = (
  expected: RestoreState,
  actual: RestoreState,
  revision: number,
): boolean => {
  try {
    return (
      actual.snapshot.revision === revision &&
      JSON.stringify(createReplacementTarget(actual.snapshot)) ===
        JSON.stringify(createReplacementTarget(expected.snapshot)) &&
      JSON.stringify(actual.settings) === JSON.stringify(expected.settings)
    )
  } catch {
    return false
  }
}

export const createPreImportRecoverySnapshotService = (
  deps: PreImportRecoverySnapshotServiceDeps,
): RecoverySnapshotService => {
  const readRestoreState = async (): Promise<RestoreState> => {
    try {
      const [snapshot, settings] = await Promise.all([
        deps.snapshotReader.readConsistentSnapshot(),
        deps.readUserSettings(),
      ])
      return { settings, snapshot }
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_SOURCE_INVALID')
    }
  }

  const persistRecoveryState = async ({
    settings,
    snapshot: source,
  }: RestoreState): Promise<RecoverySnapshotCaptureResult> => {
    if (
      hasBlockingPersistenceIntegrityIssues(
        checkPersistenceIntegrity(source.savedTabs),
      )
    ) {
      throw new PreImportRecoverySnapshotError(
        'RECOVERY_SOURCE_INTEGRITY_FAILED',
      )
    }

    const { data, serializedBytes } = toRecoveryData(source, settings)
    const capacity = await runPersistenceCapacityPreflight(
      {
        minimumReserveBytes: RECOVERY_CAPACITY_MINIMUM_RESERVE_BYTES,
        reserveRatio: RECOVERY_CAPACITY_RESERVE_RATIO,
        sourceEntityCounts: createEntityCounts(data),
        sourceSerializedBytes: serializedBytes,
        targetExpansionRatio: 1,
      },
      deps.estimateStorage,
    )
    if (capacity.status === 'blocked') {
      throw new PreImportRecoverySnapshotError('RECOVERY_CAPACITY_BLOCKED')
    }

    const now = deps.clock.now()
    const expiresAt =
      now + BACKUP_RECOVERY_RETENTION_POLICY.maxAgeDays * MILLISECONDS_PER_DAY
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(expiresAt)
    ) {
      throw new PreImportRecoverySnapshotError('RECOVERY_SOURCE_INVALID')
    }
    if (serializedBytes > BACKUP_RESOURCE_LIMITS.maxSerializedBytes) {
      throw new PreImportRecoverySnapshotError('RECOVERY_SOURCE_INVALID')
    }

    let id: string
    try {
      id = deps.idGenerator.generate()
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_PERSIST_FAILED')
    }

    let savedRevision: number
    try {
      const saved = await deps.repository.saveWithRetention(
        {
          backupSchemaVersion: BACKUP_V2_SCHEMA_VERSION,
          createdAt: now,
          data,
          expiresAt,
          id,
          serializedBytes,
          sourceRevision: source.revision,
        },
        {
          ...BACKUP_RECOVERY_RETENTION_POLICY,
          now,
        },
      )
      savedRevision = saved.revision
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_PERSIST_FAILED')
    }

    const notification = await publishPostCommitNotification({
      changePort: deps.changePort,
      idGenerator: deps.idGenerator,
      revision: savedRevision,
      scopes: ['recoverySnapshots'],
    })
    return {
      id,
      notification,
      revision: savedRevision,
    }
  }

  const captureBeforeOverwrite =
    async (): Promise<RecoverySnapshotCaptureResult> => {
      const state = await readRestoreState()
      return persistRecoveryState(state)
    }

  const compensateAndThrow = async (
    previous: RestoreState,
    errorCode: PreImportRecoverySnapshotErrorCode,
  ): Promise<never> => {
    let revision: number
    try {
      const result = await deps.replacement.replaceAll(
        createReplacementTarget(previous.snapshot),
      )
      revision = result.revision
      await deps.writeUserSettings(previous.settings)
      const readback = await readRestoreState()
      if (!matchesRestoreState(previous, readback, revision)) {
        throw new Error('Compensation readback mismatch')
      }
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_COMPENSATION_FAILED')
    }

    const notification = await publishPostCommitNotification({
      changePort: deps.changePort,
      idGenerator: deps.idGenerator,
      revision,
      scopes: RESTORE_CHANGE_SCOPES,
    })
    throw new PreImportRecoverySnapshotError(errorCode, {
      notification,
      revision,
    })
  }

  const restore: RecoverySnapshotService['restore'] = async (id, options) => {
    const now = deps.clock.now()
    let record: PersistenceRecoverySnapshotRecord | undefined
    try {
      record = await deps.repository.findAvailableById(id, now)
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_SNAPSHOT_INVALID')
    }
    if (record === undefined) {
      throw new PreImportRecoverySnapshotError('RECOVERY_SNAPSHOT_NOT_FOUND')
    }
    const data = parseRecoveryData(record)
    if (
      hasBlockingPersistenceIntegrityIssues(
        checkPersistenceIntegrity(data.savedTabs),
      )
    ) {
      throw new PreImportRecoverySnapshotError('RECOVERY_SNAPSHOT_INVALID')
    }

    const previous = await readRestoreState()
    if (options?.captureCurrent === true) {
      await persistRecoveryState(previous)
    }

    const logicalSnapshot = BackupMapper.toLogicalSnapshot(data, 0)
    let revision: number
    try {
      const result = await deps.replacement.replaceAll(
        createReplacementTarget(logicalSnapshot),
      )
      revision = result.revision
    } catch {
      throw new PreImportRecoverySnapshotError('RECOVERY_REPLACEMENT_FAILED')
    }

    try {
      await deps.writeUserSettings(data.userSettings)
    } catch {
      return compensateAndThrow(previous, 'RECOVERY_SETTINGS_WRITE_FAILED')
    }

    let readback: PersistenceLogicalSnapshot
    let settings: UserSettings
    try {
      readback = await deps.snapshotReader.readConsistentSnapshot()
      settings = await deps.readUserSettings()
    } catch {
      return compensateAndThrow(previous, 'RECOVERY_READBACK_FAILED')
    }
    try {
      assertMatchingReadback(data, readback, settings, revision)
    } catch {
      return compensateAndThrow(previous, 'RECOVERY_READBACK_MISMATCH')
    }
    const notification = await publishPostCommitNotification({
      changePort: deps.changePort,
      idGenerator: deps.idGenerator,
      revision,
      scopes: RESTORE_CHANGE_SCOPES,
    })
    return { notification, revision }
  }

  return {
    captureBeforeOverwrite,
    listAvailable: async () => deps.repository.listAvailable(deps.clock.now()),
    restore,
  }
}

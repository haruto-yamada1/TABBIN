import {
  checkPersistenceIntegrity,
  hasBlockingPersistenceIntegrityIssues,
} from '@/contexts/saved-tabs/public-api'
import type {
  IdGeneratorPort,
  PersistenceChangePort,
  PersistenceLogicalSnapshot,
  PersistenceV2ReplacementPort,
  PersistenceV2ReplacementTarget,
} from '@/contexts/saved-tabs/public-api'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import { selectBackupImportData } from './BackupV2ImportDiff'
import type { BackupImportOptions } from './BackupV2ImportDiff'
import type {
  BackupPreviewEntityCounts,
  BackupV2Inspection,
} from './BackupV2Inspector'
import { collectBackupV2ResourceUsage } from './BackupV2ResourceUsage'
import {
  BACKUP_V2_SCHEMA_VERSION,
  BackupEnvelopeV2Schema,
} from './BackupV2Schema'
import type { BackupDataV2, BackupEnvelopeV2 } from './BackupV2Schema'
import {
  publishPostCommitNotification,
  RESTORE_CHANGE_SCOPES,
} from './PreImportRecoverySnapshotService'
import type { RecoverySnapshotNotificationOutcome } from './PreImportRecoverySnapshotService'

export type BackupV2ImportErrorCode =
  | 'BACKUP_INTEGRITY_FAILED'
  | 'BACKUP_RESOURCE_REJECTED'
  | 'INVALID_BACKUP'
  | 'IMPORT_PREVIEW_STALE'
  | 'IMPORT_SELECTION_EMPTY'
  | 'OVERWRITE_RECOVERY_UNAVAILABLE'
  | 'PERSISTENCE_REPLACEMENT_FAILED'
  | 'READBACK_FAILED'
  | 'READBACK_MISMATCH'
  | 'RECOVERY_CAPTURE_FAILED'
  | 'RECOVERY_RESTORE_FAILED'
  | 'SETTINGS_WRITE_FAILED'

const BACKUP_V2_IMPORT_ERROR_MESSAGES = {
  BACKUP_INTEGRITY_FAILED: 'The backup failed the persistence integrity check.',
  BACKUP_RESOURCE_REJECTED: 'The backup exceeds an import resource limit.',
  INVALID_BACKUP: 'The backup does not match Backup V2.',
  IMPORT_PREVIEW_STALE: 'Current data changed. Review a new import preview.',
  IMPORT_SELECTION_EMPTY: 'Select at least one section to restore.',
  OVERWRITE_RECOVERY_UNAVAILABLE:
    'Overwrite import requires a recovery snapshot capability.',
  PERSISTENCE_REPLACEMENT_FAILED: 'The atomic persistence replacement failed.',
  READBACK_FAILED: 'The imported data could not be read back.',
  READBACK_MISMATCH: 'The imported data did not match readback.',
  RECOVERY_CAPTURE_FAILED:
    'The pre-overwrite recovery snapshot could not be captured.',
  RECOVERY_RESTORE_FAILED: 'The recovery snapshot could not be restored.',
  SETTINGS_WRITE_FAILED: 'The separate settings write failed.',
} as const satisfies Record<BackupV2ImportErrorCode, string>

export class BackupV2ImportError extends Error {
  readonly code: BackupV2ImportErrorCode

  constructor(code: BackupV2ImportErrorCode) {
    super(BACKUP_V2_IMPORT_ERROR_MESSAGES[code])
    this.name = 'BackupV2ImportError'
    this.code = code
  }
}

export type OverwriteRecoveryCapability = {
  readonly captureBeforeOverwrite: () => Promise<unknown>
  readonly restore: (
    recoveryId: unknown,
    options?: {
      readonly preserveSettings?: boolean
      readonly expectedRevision?: number
    },
  ) => Promise<void>
}

export type ImportBackupV2UseCaseDeps = {
  readonly changePort: PersistenceChangePort
  readonly idGenerator: IdGeneratorPort
  /** Must use the same normalization policy as writeUserSettings. */
  readonly normalizeUserSettings: (settings: UserSettings) => UserSettings
  readonly readUserSettings: () => Promise<UserSettings>
  readonly recovery?: OverwriteRecoveryCapability | undefined
  readonly replacement: PersistenceV2ReplacementPort
  readonly snapshotReader: {
    readonly readConsistentSnapshot: () => Promise<PersistenceLogicalSnapshot>
  }
  readonly writeUserSettings: (settings: UserSettings) => Promise<void>
}

export type ImportBackupV2Result = {
  readonly concurrentChange?: true
  readonly notification: RecoverySnapshotNotificationOutcome
  readonly entityCounts: BackupPreviewEntityCounts
  readonly revision: number
}

export type ImportBackupV2UseCase = (
  inspection: BackupV2Inspection,
  options?: BackupImportOptions,
) => Promise<ImportBackupV2Result>

const textEncoder = new TextEncoder()

const createEntityCounts = (data: BackupDataV2): BackupPreviewEntityCounts => ({
  analyticsViews: data.analyticsViews.length,
  categories: data.savedTabs.categories.length,
  collections: data.savedTabs.collections.length,
  conversations: data.conversations.length,
  groups: data.savedTabs.groups.length,
  memberships: data.savedTabs.memberships.length,
  messages: data.messages.length,
  urls: data.savedTabs.urls.length,
})

const reconstructEnvelope = (
  inspection: BackupV2Inspection,
): BackupEnvelopeV2 => {
  try {
    return BackupEnvelopeV2Schema.parse({
      appVersion: inspection.preview.appVersion,
      data: inspection.data,
      exportedAt: inspection.preview.exportedAt,
      schemaVersion: BACKUP_V2_SCHEMA_VERSION,
    })
  } catch {
    throw new BackupV2ImportError('INVALID_BACKUP')
  }
}

const createReplacementTarget = (
  logicalSnapshot: PersistenceLogicalSnapshot,
): PersistenceV2ReplacementTarget => ({
  analyticsViews: logicalSnapshot.analyticsViews,
  conversations: logicalSnapshot.conversations,
  messages: logicalSnapshot.messages,
  savedTabs: logicalSnapshot.savedTabs,
})

const assertPreflight = (
  envelope: BackupEnvelopeV2,
): PersistenceLogicalSnapshot => {
  const serialized = JSON.stringify(envelope)
  try {
    collectBackupV2ResourceUsage(
      envelope.data,
      textEncoder.encode(serialized).byteLength,
    )
  } catch {
    throw new BackupV2ImportError('BACKUP_RESOURCE_REJECTED')
  }

  if (
    hasBlockingPersistenceIntegrityIssues(
      checkPersistenceIntegrity(envelope.data.savedTabs),
    )
  ) {
    throw new BackupV2ImportError('BACKUP_INTEGRITY_FAILED')
  }

  try {
    return BackupMapper.toLogicalSnapshot(envelope.data, 0)
  } catch {
    throw new BackupV2ImportError('INVALID_BACKUP')
  }
}

const restoreAndThrow = async (
  recovery: OverwriteRecoveryCapability,
  recoveryId: unknown,
  failureCode: BackupV2ImportErrorCode,
  options: {
    readonly preserveSettings: boolean
    readonly expectedRevision: number | undefined
  },
): Promise<never> => {
  try {
    if (options.preserveSettings || options.expectedRevision !== undefined) {
      await recovery.restore(recoveryId, {
        preserveSettings: options.preserveSettings,
        ...(options.expectedRevision === undefined
          ? {}
          : { expectedRevision: options.expectedRevision }),
      })
    } else {
      await recovery.restore(recoveryId)
    }
  } catch {
    throw new BackupV2ImportError('RECOVERY_RESTORE_FAILED')
  }
  throw new BackupV2ImportError(failureCode)
}

const isRevisionConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'REVISION_CONFLICT'

const assertImportPreviewCurrent = async (
  deps: ImportBackupV2UseCaseDeps,
  options: BackupImportOptions,
): Promise<void> => {
  const [currentSnapshot, currentSettings] = await Promise.all([
    deps.snapshotReader.readConsistentSnapshot(),
    deps.readUserSettings(),
  ])
  const currentData = BackupMapper.toBackupData(
    currentSnapshot,
    deps.normalizeUserSettings(currentSettings),
  )
  if (
    currentSnapshot.revision !== options.current.revision ||
    JSON.stringify(currentData) !== JSON.stringify(options.current.data)
  ) {
    throw new BackupV2ImportError('IMPORT_PREVIEW_STALE')
  }
}

const getConfirmedReplacementRevision = async (
  deps: ImportBackupV2UseCaseDeps,
  options: BackupImportOptions,
  recoveryId: unknown,
): Promise<number> => {
  if (
    typeof recoveryId !== 'object' ||
    recoveryId === null ||
    !('revision' in recoveryId) ||
    typeof recoveryId.revision !== 'number'
  ) {
    throw new BackupV2ImportError('RECOVERY_CAPTURE_FAILED')
  }
  const settings = deps.normalizeUserSettings(await deps.readUserSettings())
  const canonicalSettings = BackupMapper.toBackupData(
    BackupMapper.toLogicalSnapshot(options.current.data, 0),
    settings,
  ).userSettings
  if (
    recoveryId.revision !== options.current.revision + 1 ||
    JSON.stringify(canonicalSettings) !==
      JSON.stringify(options.current.data.userSettings)
  ) {
    throw new BackupV2ImportError('IMPORT_PREVIEW_STALE')
  }
  return recoveryId.revision
}

const prepareRequestedBackup = (
  inspection: BackupV2Inspection,
  normalizeUserSettings: ImportBackupV2UseCaseDeps['normalizeUserSettings'],
  options?: BackupImportOptions,
) => {
  const incomingEnvelope = reconstructEnvelope(inspection)
  assertPreflight(incomingEnvelope)
  if (options && !Object.values(options.selection).some(Boolean)) {
    throw new BackupV2ImportError('IMPORT_SELECTION_EMPTY')
  }
  const envelope = options
    ? {
        ...incomingEnvelope,
        data: selectBackupImportData(
          options.current.data,
          incomingEnvelope.data,
          options.selection,
        ),
      }
    : incomingEnvelope
  const requestedSnapshot = assertPreflight(envelope)
  let requestedData: BackupDataV2
  try {
    requestedData = BackupMapper.toBackupData(
      requestedSnapshot,
      normalizeUserSettings(envelope.data.userSettings),
    )
  } catch {
    throw new BackupV2ImportError('INVALID_BACKUP')
  }
  assertPreflight({ ...envelope, data: requestedData })
  return { requestedData, requestedSnapshot }
}

const writeSelectedSettings = async (
  deps: ImportBackupV2UseCaseDeps,
  requestedData: BackupDataV2,
  options?: BackupImportOptions,
): Promise<void> => {
  if (!options || options.selection.userSettings) {
    await deps.writeUserSettings(requestedData.userSettings)
  }
}

const matchesImportedData = (
  requested: BackupDataV2,
  snapshot: PersistenceLogicalSnapshot,
  settings: UserSettings,
  verification: {
    readonly revision: number
    readonly preserveSettings: boolean
  },
): boolean => {
  try {
    const actual = BackupMapper.toBackupData(
      snapshot,
      verification.preserveSettings ? requested.userSettings : settings,
    )
    return (
      !hasBlockingPersistenceIntegrityIssues(
        checkPersistenceIntegrity(snapshot.savedTabs),
      ) &&
      JSON.stringify(actual.userSettings) ===
        JSON.stringify(requested.userSettings) &&
      (snapshot.revision > verification.revision ||
        (snapshot.revision === verification.revision &&
          JSON.stringify(actual) === JSON.stringify(requested)))
    )
  } catch {
    return false
  }
}

/**
 * Performs an overwrite import with recovery and verified readback.
 *
 * IndexedDB logical data is replaced atomically by `replacement`. Chrome-owned
 * settings are necessarily written afterward through a separate storage engine,
 * so this use case intentionally makes no cross-engine atomicity claim. Any
 * failure after replacement requests revision-guarded restoration. A later
 * IndexedDB commit is preserved, and unselected settings are never restored.
 * A settings backend could still apply a partial write before reporting failure.
 */
export const createImportBackupV2UseCase = (
  deps: ImportBackupV2UseCaseDeps,
): ImportBackupV2UseCase => {
  return async (inspection, options) => {
    const preserveSettings = options?.selection.userSettings === false
    const { requestedData, requestedSnapshot } = prepareRequestedBackup(
      inspection,
      deps.normalizeUserSettings,
      options,
    )
    const recovery = deps.recovery

    if (recovery === undefined) {
      throw new BackupV2ImportError('OVERWRITE_RECOVERY_UNAVAILABLE')
    }

    if (options) {
      await assertImportPreviewCurrent(deps, options)
    }

    let recoveryId: unknown
    try {
      recoveryId = await recovery.captureBeforeOverwrite()
    } catch {
      throw new BackupV2ImportError('RECOVERY_CAPTURE_FAILED')
    }

    const expectedRevision = options
      ? await getConfirmedReplacementRevision(deps, options, recoveryId)
      : undefined

    let replacementResult: { readonly revision: number }
    try {
      const target = createReplacementTarget(requestedSnapshot)
      replacementResult =
        expectedRevision === undefined
          ? await deps.replacement.replaceAll(target)
          : await deps.replacement.replaceAll(target, { expectedRevision })
    } catch (error) {
      if (isRevisionConflict(error)) {
        // The transaction aborted before any write. Restoring would erase another context's change.
        throw new BackupV2ImportError('IMPORT_PREVIEW_STALE')
      }
      return restoreAndThrow(
        recovery,
        recoveryId,
        'PERSISTENCE_REPLACEMENT_FAILED',
        { preserveSettings, expectedRevision },
      )
    }

    const recoveryOptions = {
      preserveSettings,
      expectedRevision: options ? replacementResult.revision : undefined,
    }
    try {
      await writeSelectedSettings(deps, requestedData, options)
    } catch {
      return restoreAndThrow(
        recovery,
        recoveryId,
        'SETTINGS_WRITE_FAILED',
        recoveryOptions,
      )
    }

    let readbackSnapshot: PersistenceLogicalSnapshot
    let readbackSettings: UserSettings
    try {
      readbackSnapshot = await deps.snapshotReader.readConsistentSnapshot()
      readbackSettings = await deps.readUserSettings()
    } catch {
      return restoreAndThrow(
        recovery,
        recoveryId,
        'READBACK_FAILED',
        recoveryOptions,
      )
    }

    const concurrentChange =
      readbackSnapshot.revision > replacementResult.revision
    if (
      !matchesImportedData(requestedData, readbackSnapshot, readbackSettings, {
        revision: replacementResult.revision,
        preserveSettings,
      })
    ) {
      return restoreAndThrow(
        recovery,
        recoveryId,
        'READBACK_MISMATCH',
        recoveryOptions,
      )
    }

    const notification = await publishPostCommitNotification({
      changePort: deps.changePort,
      idGenerator: deps.idGenerator,
      revision: replacementResult.revision,
      scopes: RESTORE_CHANGE_SCOPES,
    })
    return {
      ...(concurrentChange ? { concurrentChange: true as const } : {}),
      notification,
      entityCounts: createEntityCounts(requestedData),
      revision: replacementResult.revision,
    }
  }
}

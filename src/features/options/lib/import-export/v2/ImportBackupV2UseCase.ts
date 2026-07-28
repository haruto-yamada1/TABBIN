import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import type {
  PersistenceLogicalSnapshot,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/public-api'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
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

export type BackupV2ImportErrorCode =
  | 'BACKUP_INTEGRITY_FAILED'
  | 'BACKUP_RESOURCE_REJECTED'
  | 'INVALID_BACKUP'
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

type PersistenceV2ReplacementTarget = {
  readonly analyticsViews: PersistenceLogicalSnapshot['analyticsViews']
  readonly conversations: PersistenceLogicalSnapshot['conversations']
  readonly messages: PersistenceLogicalSnapshot['messages']
  readonly savedTabs: PersistenceV2Snapshot
}

type PersistenceV2ReplacementPort = {
  readonly replaceAll: (
    target: PersistenceV2ReplacementTarget,
  ) => Promise<{ readonly revision: number }>
}

export type OverwriteRecoveryCapability = {
  readonly captureBeforeOverwrite: () => Promise<unknown>
  readonly restore: (recoveryId: unknown) => Promise<void>
}

export type ImportBackupV2UseCaseDeps = {
  readonly readUserSettings: () => Promise<UserSettings>
  readonly recovery?: OverwriteRecoveryCapability | undefined
  readonly replacement: PersistenceV2ReplacementPort
  readonly snapshotReader: {
    readonly readConsistentSnapshot: () => Promise<PersistenceLogicalSnapshot>
  }
  readonly writeUserSettings: (settings: UserSettings) => Promise<void>
}

export type ImportBackupV2Result = {
  readonly entityCounts: BackupPreviewEntityCounts
  readonly revision: number
}

export type ImportBackupV2UseCase = (
  inspection: BackupV2Inspection,
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

  if (!checkPersistenceIntegrity(envelope.data.savedTabs).isHealthy) {
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
): Promise<never> => {
  try {
    await recovery.restore(recoveryId)
  } catch {
    throw new BackupV2ImportError('RECOVERY_RESTORE_FAILED')
  }
  throw new BackupV2ImportError(failureCode)
}

/**
 * Performs an overwrite import with recovery and verified readback.
 *
 * IndexedDB logical data is replaced atomically by `replacement`. Chrome-owned
 * settings are necessarily written afterward through a separate storage engine,
 * so this use case intentionally makes no cross-engine atomicity claim. Any
 * failure after recovery capture requests restoration, but a settings backend
 * could still have applied a partial write before reporting failure.
 */
export const createImportBackupV2UseCase = (
  deps: ImportBackupV2UseCaseDeps,
): ImportBackupV2UseCase => {
  return async (inspection) => {
    const envelope = reconstructEnvelope(inspection)
    const requestedSnapshot = assertPreflight(envelope)
    const requestedData = BackupMapper.toBackupData(
      requestedSnapshot,
      envelope.data.userSettings,
    )
    const recovery = deps.recovery

    if (recovery === undefined) {
      throw new BackupV2ImportError('OVERWRITE_RECOVERY_UNAVAILABLE')
    }

    let recoveryId: unknown
    try {
      recoveryId = await recovery.captureBeforeOverwrite()
    } catch {
      throw new BackupV2ImportError('RECOVERY_CAPTURE_FAILED')
    }

    let replacementResult: { readonly revision: number }
    try {
      replacementResult = await deps.replacement.replaceAll(
        createReplacementTarget(requestedSnapshot),
      )
    } catch {
      return restoreAndThrow(
        recovery,
        recoveryId,
        'PERSISTENCE_REPLACEMENT_FAILED',
      )
    }

    try {
      await deps.writeUserSettings(requestedData.userSettings)
    } catch {
      return restoreAndThrow(recovery, recoveryId, 'SETTINGS_WRITE_FAILED')
    }

    let readbackSnapshot: PersistenceLogicalSnapshot
    let readbackSettings: UserSettings
    try {
      readbackSnapshot = await deps.snapshotReader.readConsistentSnapshot()
      readbackSettings = await deps.readUserSettings()
    } catch {
      return restoreAndThrow(recovery, recoveryId, 'READBACK_FAILED')
    }

    let readbackData: BackupDataV2
    try {
      readbackData = BackupMapper.toBackupData(
        readbackSnapshot,
        readbackSettings,
      )
    } catch {
      return restoreAndThrow(recovery, recoveryId, 'READBACK_MISMATCH')
    }

    if (
      readbackSnapshot.revision !== replacementResult.revision ||
      !checkPersistenceIntegrity(readbackSnapshot.savedTabs).isHealthy ||
      JSON.stringify(readbackData) !== JSON.stringify(requestedData)
    ) {
      return restoreAndThrow(recovery, recoveryId, 'READBACK_MISMATCH')
    }

    return {
      entityCounts: createEntityCounts(requestedData),
      revision: replacementResult.revision,
    }
  }
}

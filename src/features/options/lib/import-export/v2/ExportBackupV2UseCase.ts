import { assertBackupSerializedBytes } from '@/lib/persistence/backupResourcePolicy'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import { collectBackupV2ResourceUsage } from './BackupV2ResourceUsage'
import {
  BACKUP_V2_SCHEMA_VERSION,
  BackupEnvelopeV2Schema,
} from './BackupV2Schema'
import type { BackupEnvelopeV2 } from './BackupV2Schema'

type PersistenceLogicalSnapshot = Parameters<
  typeof BackupMapper.toBackupData
>[0]

export type ExportBackupV2UseCaseDeps = {
  readonly getAppVersion: () => string
  readonly now: () => Date
  readonly readUserSettings: () => Promise<UserSettings>
  readonly snapshotReader: {
    readonly readConsistentSnapshot: () => Promise<PersistenceLogicalSnapshot>
  }
}

export type ExportBackupV2UseCase = () => Promise<BackupEnvelopeV2>

/**
 * Creates the public Backup V2 envelope.
 *
 * The snapshot reader owns the one-transaction consistent view of IndexedDB
 * logical data. User settings are intentionally read through a separate
 * dependency because their Chrome-owned storage cannot be part of that IndexedDB
 * transaction; this use case does not claim cross-engine atomicity.
 */
export const createExportBackupV2UseCase = (
  deps: ExportBackupV2UseCaseDeps,
): ExportBackupV2UseCase => {
  return async () => {
    const [snapshot, userSettings] = await Promise.all([
      deps.snapshotReader.readConsistentSnapshot(),
      deps.readUserSettings(),
    ])
    const appVersion = deps.getAppVersion()
    const exportedAt = deps.now().toISOString()
    const data = BackupMapper.toBackupData(snapshot, userSettings)
    const envelope = BackupEnvelopeV2Schema.parse({
      appVersion,
      data,
      exportedAt,
      schemaVersion: BACKUP_V2_SCHEMA_VERSION,
    })
    collectBackupV2ResourceUsage(envelope.data, 0)
    const serialized = JSON.stringify(envelope)
    assertBackupSerializedBytes(new TextEncoder().encode(serialized).byteLength)
    return envelope
  }
}

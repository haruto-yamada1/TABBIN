import { LEGACY_BACKUP_ADVISORY } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'
import { convertLegacyBackup } from '@/features/options/lib/import-export/legacy/LegacyBackupAdapter'
import type { LegacyBackupWarning } from '@/features/options/lib/import-export/legacy/LegacyBackupAdapter'
import { createBackupMigrationPipeline } from '@/lib/persistence/backupMigrationPipeline'
import { BackupSchemaError } from '@/lib/persistence/backupSchema'

import {
  BACKUP_V2_SCHEMA_VERSION,
  BackupEnvelopeV2Schema,
} from './BackupV2Schema'
import type { BackupDataV2, BackupEnvelopeV2 } from './BackupV2Schema'

export type BackupPreviewEntityCounts = {
  readonly analyticsViews: number
  readonly categories: number
  readonly collections: number
  readonly conversations: number
  readonly groups: number
  readonly memberships: number
  readonly messages: number
  readonly urls: number
}

type BackupPreviewBase = {
  readonly appVersion: string
  readonly entityCounts: BackupPreviewEntityCounts
  readonly exportedAt: string
  readonly warnings: readonly LegacyBackupWarning[]
}

export type BackupV2Preview =
  | (BackupPreviewBase & {
      readonly formatKind: 'current-v2'
      readonly schemaVersion: 2
    })
  | (BackupPreviewBase & {
      readonly advisory: typeof LEGACY_BACKUP_ADVISORY
      readonly formatKind: 'legacy'
      readonly schemaVersion: null
    })

export type BackupV2Inspection = {
  readonly data: BackupDataV2
  readonly preview: BackupV2Preview
}

export type InspectBackupV2Options = {
  readonly importDate: string
}

const migrationPipeline = createBackupMigrationPipeline<BackupEnvelopeV2>({
  currentSchema: BackupEnvelopeV2Schema,
  currentVersion: BACKUP_V2_SCHEMA_VERSION,
  migrations: new Map(),
})

const parseUnknownInput = (input: unknown): unknown => {
  if (typeof input !== 'string') {
    return input
  }

  try {
    const parsed: unknown = JSON.parse(input)
    return parsed
  } catch {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
}

const countEntities = (data: BackupDataV2): BackupPreviewEntityCounts => ({
  analyticsViews: data.analyticsViews.length,
  categories: data.savedTabs.categories.length,
  collections: data.savedTabs.collections.length,
  conversations: data.conversations.length,
  groups: data.savedTabs.groups.length,
  memberships: data.savedTabs.memberships.length,
  messages: data.messages.length,
  urls: data.savedTabs.urls.length,
})

export const inspectBackupV2 = (
  input: unknown,
  { importDate }: InspectBackupV2Options,
): BackupV2Inspection => {
  const parsedInput = parseUnknownInput(input)
  const migrationResult = migrationPipeline.migrateToCurrent(parsedInput)

  if (migrationResult.kind === 'current') {
    const { backup } = migrationResult
    return {
      data: backup.data,
      preview: {
        appVersion: backup.appVersion,
        entityCounts: countEntities(backup.data),
        exportedAt: backup.exportedAt,
        formatKind: 'current-v2',
        schemaVersion: BACKUP_V2_SCHEMA_VERSION,
        warnings: [],
      },
    }
  }

  const legacy = convertLegacyBackup(parsedInput, importDate)
  return {
    data: legacy.data,
    preview: {
      advisory: LEGACY_BACKUP_ADVISORY,
      appVersion: legacy.appVersion,
      entityCounts: countEntities(legacy.data),
      exportedAt: legacy.exportedAt,
      formatKind: 'legacy',
      schemaVersion: null,
      warnings: legacy.warnings,
    },
  }
}

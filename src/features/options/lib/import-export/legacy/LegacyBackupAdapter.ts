import { mapLegacyStorageToPersistenceV2 } from '@/contexts/saved-tabs/public-api'
import type {
  LegacyMigrationIssueCode,
  RawLegacyStorageSnapshot,
  RawLegacyStorageValue,
} from '@/contexts/saved-tabs/public-api'
import { isLegacyBackupImportSupported } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'
import { BackupMapper } from '@/features/options/lib/import-export/v2/BackupMapper'
import type { BackupDataV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  BackupSchemaError,
  detectBackupFormat,
} from '@/lib/persistence/backupSchema'
import { defaultSettings } from '@/lib/storage/settings'

import { LegacyBackupV0Schema } from './LegacyBackupV0Schema'
import type { LegacyBackupV0 } from './LegacyBackupV0Schema'

export type LegacyBackupImportErrorCode =
  | 'LEGACY_IMPORT_CUTOFF_REACHED'
  | 'LEGACY_MIGRATION_BLOCKED'

const LEGACY_BACKUP_IMPORT_ERROR_MESSAGES: Readonly<
  Record<LegacyBackupImportErrorCode, string>
> = {
  LEGACY_IMPORT_CUTOFF_REACHED: 'Legacy backup import is no longer supported',
  LEGACY_MIGRATION_BLOCKED: 'Legacy backup migration validation failed',
}

export class LegacyBackupImportError extends Error {
  readonly code: LegacyBackupImportErrorCode
  readonly issueCodes: readonly LegacyMigrationIssueCode[]

  constructor(
    code: LegacyBackupImportErrorCode,
    issueCodes: readonly LegacyMigrationIssueCode[] = [],
  ) {
    super(LEGACY_BACKUP_IMPORT_ERROR_MESSAGES[code])
    this.name = 'LegacyBackupImportError'
    this.code = code
    this.issueCodes = issueCodes
  }
}

export type LegacyBackupWarning = {
  readonly code: LegacyMigrationIssueCode
  readonly count: number
}

export type LegacyBackupConversion = {
  readonly appVersion: string
  readonly data: BackupDataV2
  readonly exportedAt: string
  readonly warnings: readonly LegacyBackupWarning[]
}

const toLegacySourceValue = (
  backup: Record<string, unknown>,
  key: string,
): RawLegacyStorageValue =>
  Object.hasOwn(backup, key)
    ? { status: 'present', value: backup[key] }
    : { status: 'missing' }

const toRawLegacyStorageSnapshot = (
  backup: Record<string, unknown>,
): RawLegacyStorageSnapshot => ({
  activeAiChatConversationId: toLegacySourceValue(
    backup,
    'activeAiChatConversationId',
  ),
  aiChatConversations: toLegacySourceValue(backup, 'aiChatConversations'),
  customProjectOrder: toLegacySourceValue(backup, 'customProjectOrder'),
  customProjects: toLegacySourceValue(backup, 'customProjects'),
  domainCategoryMappings: { status: 'missing' },
  domainCategorySettings: { status: 'missing' },
  parentCategories: toLegacySourceValue(backup, 'parentCategories'),
  savedAnalyticsViews: toLegacySourceValue(backup, 'savedAnalyticsViews'),
  savedTabs: toLegacySourceValue(backup, 'savedTabs'),
  urls: toLegacySourceValue(backup, 'urls'),
})

type LegacyNestedUrl = NonNullable<
  LegacyBackupV0['savedTabs'][number]['urls']
>[number]

const normalizeLegacyNestedUrl = (
  url: LegacyNestedUrl,
): Omit<LegacyNestedUrl, 'tabId' | 'timestamp'> => {
  const savedAt = url.savedAt ?? url.timestamp
  return {
    ...(url.favIconUrl === undefined ? {} : { favIconUrl: url.favIconUrl }),
    ...(url.id === undefined ? {} : { id: url.id }),
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(url.subCategory === undefined ? {} : { subCategory: url.subCategory }),
    title: url.title,
    url: url.url,
  }
}

const normalizeLegacyBackupForMapper = (
  backup: LegacyBackupV0,
): LegacyBackupV0 => ({
  ...backup,
  ...(backup.customProjects === undefined
    ? {}
    : {
        customProjects: backup.customProjects.map((project) => ({
          ...project,
          ...(project.projectKeywords === undefined
            ? {}
            : {
                projectKeywords: {
                  domainKeywords: project.projectKeywords.domainKeywords ?? [],
                  titleKeywords: project.projectKeywords.titleKeywords ?? [],
                  urlKeywords: project.projectKeywords.urlKeywords ?? [],
                },
              }),
        })),
      }),
  savedTabs: backup.savedTabs.map((savedTab) => ({
    ...savedTab,
    ...(savedTab.urls === undefined
      ? {}
      : { urls: savedTab.urls.map(normalizeLegacyNestedUrl) }),
  })),
})

export const convertLegacyBackup = (
  input: unknown,
  importDate: string,
): LegacyBackupConversion => {
  if (detectBackupFormat(input).kind !== 'legacy') {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
  if (!isLegacyBackupImportSupported(importDate)) {
    throw new LegacyBackupImportError('LEGACY_IMPORT_CUTOFF_REACHED')
  }

  const legacyResult = LegacyBackupV0Schema.safeParse(input)
  if (!legacyResult.success) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }

  const legacyBackup = legacyResult.data
  const normalizedLegacyBackup = normalizeLegacyBackupForMapper(legacyBackup)
  const migration = mapLegacyStorageToPersistenceV2(
    toRawLegacyStorageSnapshot(normalizedLegacyBackup),
  )
  const errors = migration.issues.filter(({ severity }) => severity === 'error')
  if (errors.length > 0) {
    throw new LegacyBackupImportError(
      'LEGACY_MIGRATION_BLOCKED',
      errors.map(({ code }) => code),
    )
  }

  const userSettings = {
    ...structuredClone(defaultSettings),
    ...structuredClone(legacyBackup.userSettings),
  }
  const data = BackupMapper.toBackupData(
    {
      ...migration.target,
      revision: 0,
    },
    userSettings,
  )

  return {
    appVersion: legacyBackup.version,
    data,
    exportedAt: legacyBackup.timestamp,
    warnings: migration.issues.reduce<LegacyBackupWarning[]>(
      (warnings, { code, occurrenceCount, severity }) => {
        if (severity === 'warning') {
          warnings.push({ code, count: occurrenceCount })
        }
        return warnings
      },
      [],
    ),
  }
}

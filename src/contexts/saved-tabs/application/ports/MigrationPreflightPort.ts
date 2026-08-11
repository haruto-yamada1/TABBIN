import { PERSISTENCE_V2_INVARIANT_CODES } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type { PersistenceTimestampMigrationSummary } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type { PersistenceSourceEntityCounts } from '@/lib/persistence/capacity'

import type { RawLegacyStorageSnapshot } from './RawLegacyStorageReaderPort'

export const MIGRATION_PREFLIGHT_VERSION = 1
export const MIGRATION_SOURCE_FINGERPRINT_VERSION = 1

export const MIGRATION_PREFLIGHT_ISSUE_CODES = [
  ...PERSISTENCE_V2_INVARIANT_CODES,
  'MIGRATION_SOURCE_INVALID_TYPE',
  'MIGRATION_SOURCE_READ_FAILED',
  'MIGRATION_SOURCE_PARTIAL_READ',
  'MIGRATION_SOURCE_MISSING_KEY',
  'PERSISTENCE_QUOTA_EXCEEDED',
  'PERSISTENCE_DISK_WRITE_FAILED',
  'PERSISTENCE_STORAGE_UNAVAILABLE',
  'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
  'LEGACY_AI_ENTITY_ID_COLLISION',
  'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT',
  'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
  'LEGACY_PARENT_CATEGORY_CONFLICT',
  'LEGACY_URL_REFERENCE_CONFLICT',
  'MIGRATION_PREFLIGHT_STATE_UNAVAILABLE',
] as const

export type MigrationPreflightIssueCode =
  (typeof MIGRATION_PREFLIGHT_ISSUE_CODES)[number]

const migrationPreflightIssueCodeSet = new Set<string>(
  MIGRATION_PREFLIGHT_ISSUE_CODES,
)

export const isMigrationPreflightIssueCode = (
  value: unknown,
): value is MigrationPreflightIssueCode =>
  typeof value === 'string' && migrationPreflightIssueCodeSet.has(value)

export type MigrationPreflightDiagnostic = {
  readonly capacityStatus: 'blocked' | 'ready'
  readonly collisionCount: number
  readonly entityCounts: PersistenceSourceEntityCounts
  readonly issueCodes: readonly MigrationPreflightIssueCode[]
  readonly preflightVersion: number
  readonly sourceFingerprintVersion: number
  readonly timestampMigrationSummary?: PersistenceTimestampMigrationSummary
}

export type MigrationPreflightStatus =
  | { readonly status: 'not-run' }
  | {
      readonly checkedAt: number
      readonly diagnostic: MigrationPreflightDiagnostic
      readonly status: 'healthy'
    }
  | {
      readonly checkedAt: number
      readonly diagnostic: MigrationPreflightDiagnostic
      readonly status: 'stale'
    }
  | {
      readonly checkedAt: number
      readonly diagnostic: MigrationPreflightDiagnostic
      readonly issueCodes: readonly MigrationPreflightIssueCode[]
      readonly status: 'blocked'
    }

export type StoredMigrationPreflight = Exclude<
  MigrationPreflightStatus,
  { readonly status: 'not-run' }
> & {
  readonly sourceFingerprint: string
}

export type MigrationPreflightRepositoryPort = {
  readonly read: () => Promise<StoredMigrationPreflight | undefined>
  readonly save: (record: StoredMigrationPreflight) => Promise<void>
}

export type MigrationPreflightReaderPort = Pick<
  MigrationPreflightRepositoryPort,
  'read'
>

export type MigrationSourceFingerprintPort = {
  readonly create: (source: RawLegacyStorageSnapshot) => Promise<string>
}

export type MigrationPreflightServicePort = {
  readonly createCurrentDataBackup: () => Promise<RawLegacyStorageSnapshot>
  readonly readHealthySourceFingerprint: () => Promise<string>
  readonly readStatus: () => Promise<MigrationPreflightStatus>
  readonly run: () => Promise<MigrationPreflightStatus>
}

import type { PersistenceSourceEntityCounts } from '@/lib/persistence/capacity'

import type { RawLegacyStorageSnapshot } from './RawLegacyStorageReaderPort'

export const PERSISTENCE_V2_MIGRATION_ERROR_CODES = [
  'MIGRATION_PREFLIGHT_NOT_APPROVED',
  'MIGRATION_SOURCE_BLOCKED',
  'MIGRATION_SOURCE_CHANGED',
  'MIGRATION_TARGET_WRITE_FAILED',
  'MIGRATION_TARGET_READ_FAILED',
  'MIGRATION_SEMANTIC_VERIFICATION_FAILED',
] as const

export type PersistenceV2MigrationErrorCode =
  (typeof PERSISTENCE_V2_MIGRATION_ERROR_CODES)[number]

export type PersistenceV2MigrationStage =
  | 'preflight'
  | 'source-map'
  | 'target-read'
  | 'target-write'
  | 'verification'

export type PersistenceV2MigrationDiagnostic = {
  readonly errorCode: PersistenceV2MigrationErrorCode
  readonly issueCodes: readonly string[]
  readonly migrationId: string
  readonly sourceBytes: number
  readonly sourceEntityCounts: PersistenceSourceEntityCounts
  readonly stage: PersistenceV2MigrationStage
}

export type PersistenceV2MigrationReport = {
  readonly collisionCount: number
  readonly migratedAnalyticsViewCount: number
  readonly migratedCategoryCount: number
  readonly migratedCollectionCount: number
  readonly migratedConversationCount: number
  readonly migratedGroupCount: number
  readonly migratedMembershipCount: number
  readonly migratedMessageCount: number
  readonly migratedUrlCount: number
  readonly migrationId: string
  readonly sourceEntityCounts: PersistenceSourceEntityCounts
  readonly warningCounts: readonly {
    readonly code: string
    readonly occurrenceCount: number
  }[]
}

export type PersistenceEmergencyBackup = {
  readonly createdAt: number
  readonly format: 'tabbin-legacy-emergency-backup'
  readonly rawLegacyStorage: RawLegacyStorageSnapshot
  readonly version: 1
  readonly warning: 'contains-private-user-data'
}

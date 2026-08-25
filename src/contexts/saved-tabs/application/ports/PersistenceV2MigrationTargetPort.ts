import type { PersistenceLogicalSnapshot } from './PersistenceV2SnapshotReaderPort'
import type { PersistenceV2WritePlan } from './PersistenceV2UnitOfWorkPort'

export const PERSISTENCE_V2_MIGRATION_TARGET_ERROR_CODES = [
  'MIGRATION_ID_INVALID',
  'MIGRATION_TARGET_NOT_PREPARED',
  'MIGRATION_TARGET_ID_MISMATCH',
  'MIGRATION_TARGET_STATE_INVALID',
  'MIGRATION_WRITE_PLAN_INVALID',
  'MIGRATION_TARGET_TRANSACTION_FAILED',
  'MIGRATION_TARGET_SNAPSHOT_INVALID',
] as const

export type PersistenceV2MigrationTargetErrorCode =
  (typeof PERSISTENCE_V2_MIGRATION_TARGET_ERROR_CODES)[number]

const ERROR_MESSAGES = {
  MIGRATION_ID_INVALID: 'The persistence migration id is invalid.',
  MIGRATION_TARGET_ID_MISMATCH:
    'The persistence migration target belongs to another migration.',
  MIGRATION_TARGET_NOT_PREPARED:
    'The persistence migration target has not been prepared.',
  MIGRATION_TARGET_SNAPSHOT_INVALID:
    'The persistence migration target snapshot is invalid.',
  MIGRATION_TARGET_STATE_INVALID:
    'The persistence migration target is in an invalid state.',
  MIGRATION_TARGET_TRANSACTION_FAILED:
    'The persistence migration target transaction failed.',
  MIGRATION_WRITE_PLAN_INVALID:
    'The persistence migration write plan is invalid.',
} as const satisfies Record<PersistenceV2MigrationTargetErrorCode, string>

export class PersistenceV2MigrationTargetError extends Error {
  readonly code: PersistenceV2MigrationTargetErrorCode

  constructor(code: PersistenceV2MigrationTargetErrorCode) {
    super(ERROR_MESSAGES[code])
    this.code = code
    this.name = 'PersistenceV2MigrationTargetError'
  }
}

export type PersistenceV2MigrationTargetPort = {
  readonly markVerified: (migrationId: string) => Promise<void>
  readonly markWritten: (migrationId: string) => Promise<void>
  readonly prepare: (migrationId: string) => Promise<void>
  readonly readSnapshot: (
    migrationId: string,
  ) => Promise<PersistenceLogicalSnapshot>
  readonly writeBatch: (
    migrationId: string,
    plan: PersistenceV2WritePlan,
  ) => Promise<void>
}

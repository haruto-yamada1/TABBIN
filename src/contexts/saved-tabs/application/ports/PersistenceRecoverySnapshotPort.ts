import type { JsonValue } from '@/lib/persistence/jsonValue'

export type PersistenceRecoverySnapshotSummary = {
  readonly createdAt: number
  readonly expiresAt: number
  readonly id: string
  readonly serializedBytes: number
  readonly sourceRevision: number
}

export type PersistenceRecoverySnapshotRecord =
  PersistenceRecoverySnapshotSummary & {
    readonly backupSchemaVersion: number
    readonly data: JsonValue
  }

export type PersistenceRecoverySnapshotRetentionPolicy = {
  readonly maxAgeDays: number
  readonly maxAggregateBytes: number
  readonly maxSnapshots: number
  readonly now: number
}

export type PersistenceRecoverySnapshotSaveResult = {
  readonly revision: number
  readonly snapshot: PersistenceRecoverySnapshotSummary
}

export type PersistenceRecoverySnapshotRepositoryPort = {
  readonly findAvailableById: (
    id: string,
    now: number,
  ) => Promise<PersistenceRecoverySnapshotRecord | undefined>
  readonly listAvailable: (
    now: number,
  ) => Promise<readonly PersistenceRecoverySnapshotSummary[]>
  readonly saveWithRetention: (
    snapshot: PersistenceRecoverySnapshotRecord,
    policy: PersistenceRecoverySnapshotRetentionPolicy,
  ) => Promise<PersistenceRecoverySnapshotSaveResult>
}

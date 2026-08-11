import type {
  MigrationPreflightDiagnostic,
  MigrationPreflightIssueCode,
  MigrationPreflightReaderPort,
  MigrationPreflightRepositoryPort,
  StoredMigrationPreflight,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import {
  isMigrationPreflightIssueCode,
  MIGRATION_PREFLIGHT_VERSION,
  MIGRATION_SOURCE_FINGERPRINT_VERSION,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  PersistenceTimestampMigrationSummary,
  PersistenceTimestampQualityCount,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type {
  PersistenceSourceEntityCounts,
  PersistenceSourceEntityKind,
} from '@/lib/persistence/capacity'
import { PERSISTENCE_SOURCE_ENTITY_KINDS } from '@/lib/persistence/capacity'

export const MIGRATION_PREFLIGHT_STORAGE_KEY = 'tabbin:migrationPreflight:v1'

export type MigrationPreflightStorageArea = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

export type MigrationPreflightStorageReader = Pick<
  MigrationPreflightStorageArea,
  'get'
>

const entityKindSet = new Set<string>(PERSISTENCE_SOURCE_ENTITY_KINDS)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isEntityKind = (value: string): value is PersistenceSourceEntityKind =>
  entityKindSet.has(value)

const decodeEntityCounts = (value: unknown): PersistenceSourceEntityCounts => {
  if (!isRecord(value)) {
    throw new MigrationPreflightRecordError()
  }
  const counts: Partial<Record<PersistenceSourceEntityKind, number>> = {}
  for (const [kind, count] of Object.entries(value)) {
    if (!isEntityKind(kind) || !isNonNegativeInteger(count)) {
      throw new MigrationPreflightRecordError()
    }
    counts[kind] = count
  }
  return counts
}

const decodeIssueCodes = (
  value: unknown,
): readonly MigrationPreflightIssueCode[] => {
  if (!Array.isArray(value) || !value.every(isMigrationPreflightIssueCode)) {
    throw new MigrationPreflightRecordError()
  }
  return value
}

const decodeTimestampQualityCount = (
  value: unknown,
): PersistenceTimestampQualityCount => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.exactCount) ||
    !isNonNegativeInteger(value.legacyFallbackCount)
  ) {
    throw new MigrationPreflightRecordError()
  }
  return {
    exactCount: value.exactCount,
    legacyFallbackCount: value.legacyFallbackCount,
  }
}

const decodeTimestampMigrationSummary = (
  value: unknown,
  entityCounts: PersistenceSourceEntityCounts,
): PersistenceTimestampMigrationSummary => {
  if (value === undefined) {
    return {
      membershipAddedAt: {
        exactCount: 0,
        legacyFallbackCount: entityCounts.memberships ?? 0,
      },
      urlFirstSavedAt: {
        exactCount: 0,
        legacyFallbackCount: entityCounts.urls ?? 0,
      },
      urlLastSavedAt: {
        exactCount: 0,
        legacyFallbackCount: entityCounts.urls ?? 0,
      },
    }
  }
  if (!isRecord(value)) {
    throw new MigrationPreflightRecordError()
  }
  return {
    membershipAddedAt: decodeTimestampQualityCount(value.membershipAddedAt),
    urlFirstSavedAt: decodeTimestampQualityCount(value.urlFirstSavedAt),
    urlLastSavedAt: decodeTimestampQualityCount(value.urlLastSavedAt),
  }
}

const decodeDiagnostic = (value: unknown): MigrationPreflightDiagnostic => {
  if (
    !isRecord(value) ||
    (value.capacityStatus !== 'ready' && value.capacityStatus !== 'blocked') ||
    !isNonNegativeInteger(value.collisionCount) ||
    value.preflightVersion !== MIGRATION_PREFLIGHT_VERSION ||
    value.sourceFingerprintVersion !== MIGRATION_SOURCE_FINGERPRINT_VERSION
  ) {
    throw new MigrationPreflightRecordError()
  }
  const entityCounts = decodeEntityCounts(value.entityCounts)
  return {
    capacityStatus: value.capacityStatus,
    collisionCount: value.collisionCount,
    entityCounts,
    issueCodes: decodeIssueCodes(value.issueCodes),
    preflightVersion: MIGRATION_PREFLIGHT_VERSION,
    sourceFingerprintVersion: MIGRATION_SOURCE_FINGERPRINT_VERSION,
    timestampMigrationSummary: decodeTimestampMigrationSummary(
      value.timestampMigrationSummary,
      entityCounts,
    ),
  }
}

const decodeStoredPreflight = (value: unknown): StoredMigrationPreflight => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.checkedAt) ||
    typeof value.sourceFingerprint !== 'string' ||
    value.sourceFingerprint.length === 0 ||
    (value.status !== 'healthy' &&
      value.status !== 'stale' &&
      value.status !== 'blocked')
  ) {
    throw new MigrationPreflightRecordError()
  }
  const base = {
    checkedAt: value.checkedAt,
    diagnostic: decodeDiagnostic(value.diagnostic),
    sourceFingerprint: value.sourceFingerprint,
  }
  if (value.status === 'blocked') {
    const issueCodes = decodeIssueCodes(value.issueCodes)
    if (issueCodes.length === 0) {
      throw new MigrationPreflightRecordError()
    }
    return { ...base, issueCodes, status: 'blocked' }
  }
  if (value.status === 'healthy') {
    return { ...base, status: 'healthy' }
  }
  return { ...base, status: 'stale' }
}

export class MigrationPreflightRecordError extends Error {
  constructor(options?: ErrorOptions) {
    super('Migration preflight state is unavailable or invalid.', options)
    this.name = 'MigrationPreflightRecordError'
  }
}

const readStoredPreflight = async (
  storage: MigrationPreflightStorageReader,
): Promise<StoredMigrationPreflight | undefined> => {
  let stored: Record<string, unknown>
  try {
    stored = await storage.get(MIGRATION_PREFLIGHT_STORAGE_KEY)
  } catch (error) {
    throw new MigrationPreflightRecordError({ cause: error })
  }
  if (!Object.hasOwn(stored, MIGRATION_PREFLIGHT_STORAGE_KEY)) {
    return undefined
  }
  return decodeStoredPreflight(stored[MIGRATION_PREFLIGHT_STORAGE_KEY])
}

export class ChromeMigrationPreflightReader implements MigrationPreflightReaderPort {
  private readonly storage: MigrationPreflightStorageReader

  constructor(storage: MigrationPreflightStorageReader) {
    this.storage = storage
  }

  readonly read = async (): Promise<StoredMigrationPreflight | undefined> =>
    readStoredPreflight(this.storage)
}

export class ChromeMigrationPreflightRepository implements MigrationPreflightRepositoryPort {
  private readonly storage: MigrationPreflightStorageArea

  constructor(storage: MigrationPreflightStorageArea) {
    this.storage = storage
  }

  readonly read = async (): Promise<StoredMigrationPreflight | undefined> =>
    readStoredPreflight(this.storage)

  readonly save = async (record: StoredMigrationPreflight): Promise<void> => {
    try {
      await this.storage.set({ [MIGRATION_PREFLIGHT_STORAGE_KEY]: record })
    } catch (error) {
      throw new MigrationPreflightRecordError({ cause: error })
    }
  }
}

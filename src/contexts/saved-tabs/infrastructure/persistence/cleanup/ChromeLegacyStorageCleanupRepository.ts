import {
  LEGACY_STORAGE_CLEANUP_METADATA_VERSION,
  LegacyStorageCleanupError,
} from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type {
  LegacyStorageCleanupMetadata,
  LegacyStorageCleanupRepositoryPort,
} from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'

export const LEGACY_STORAGE_CLEANUP_METADATA_KEY =
  'tabbin:legacyStorageCleanup:v1'

export const LEGACY_DOMAIN_STORAGE_KEYS = [
  'urls',
  'savedTabs',
  'customProjects',
  'customProjectOrder',
  'parentCategories',
  'domainCategorySettings',
  'domainCategoryMappings',
  'aiChatConversations',
  'savedAnalyticsViews',
  'urlsMigrationCompleted',
  'domainHostnameMigrationCompleted',
] as const

export type LegacyStorageCleanupStorageArea = {
  readonly get: (
    keys: string | readonly string[],
  ) => Promise<Record<string, unknown>>
  readonly remove: (keys: readonly string[]) => Promise<void>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

const BASE_METADATA_KEYS = [
  'migrationId',
  'retentionStartedAt',
  'status',
  'version',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key))

const isTimestamp = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === 'number' && value >= 0

const invalidMetadata = (): never => {
  throw new LegacyStorageCleanupError('LEGACY_STORAGE_CLEANUP_METADATA_INVALID')
}

type DecodedMetadataBase = {
  readonly migrationId: string
  readonly record: Record<string, unknown>
  readonly retentionStartedAt: number
}

const decodeMetadataBase = (value: unknown): DecodedMetadataBase => {
  if (
    !isRecord(value) ||
    typeof value.migrationId !== 'string' ||
    value.migrationId.trim().length === 0 ||
    !isTimestamp(value.retentionStartedAt) ||
    value.version !== LEGACY_STORAGE_CLEANUP_METADATA_VERSION
  ) {
    return invalidMetadata()
  }
  return {
    migrationId: value.migrationId,
    record: value,
    retentionStartedAt: value.retentionStartedAt,
  }
}

const decodeRetainedMetadata = (
  base: DecodedMetadataBase,
  status: 'eligible' | 'retained',
): LegacyStorageCleanupMetadata => {
  if (!hasOnlyKeys(base.record, BASE_METADATA_KEYS)) {
    return invalidMetadata()
  }
  return {
    migrationId: base.migrationId,
    retentionStartedAt: base.retentionStartedAt,
    status,
    version: LEGACY_STORAGE_CLEANUP_METADATA_VERSION,
  }
}

const decodeFailedMetadata = (
  base: DecodedMetadataBase,
): LegacyStorageCleanupMetadata => {
  const failedAt = base.record.failedAt
  if (
    !hasOnlyKeys(base.record, [...BASE_METADATA_KEYS, 'failedAt']) ||
    !isTimestamp(failedAt) ||
    failedAt < base.retentionStartedAt
  ) {
    return invalidMetadata()
  }
  return {
    failedAt,
    migrationId: base.migrationId,
    retentionStartedAt: base.retentionStartedAt,
    status: 'failed',
    version: LEGACY_STORAGE_CLEANUP_METADATA_VERSION,
  }
}

const decodeCompletedMetadata = (
  base: DecodedMetadataBase,
): LegacyStorageCleanupMetadata => {
  const completedAt = base.record.completedAt
  if (
    !hasOnlyKeys(base.record, [...BASE_METADATA_KEYS, 'completedAt']) ||
    !isTimestamp(completedAt) ||
    completedAt < base.retentionStartedAt
  ) {
    return invalidMetadata()
  }
  return {
    completedAt,
    migrationId: base.migrationId,
    retentionStartedAt: base.retentionStartedAt,
    status: 'completed',
    version: LEGACY_STORAGE_CLEANUP_METADATA_VERSION,
  }
}

const decodeMetadata = (value: unknown): LegacyStorageCleanupMetadata => {
  const base = decodeMetadataBase(value)
  switch (base.record.status) {
    case 'eligible':
    case 'retained': {
      return decodeRetainedMetadata(base, base.record.status)
    }
    case 'failed': {
      return decodeFailedMetadata(base)
    }
    case 'completed': {
      return decodeCompletedMetadata(base)
    }
    default: {
      return invalidMetadata()
    }
  }
}

const toStorageError = (error: unknown): LegacyStorageCleanupError =>
  error instanceof LegacyStorageCleanupError
    ? error
    : new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
        { cause: error },
      )

export class ChromeLegacyStorageCleanupRepository implements LegacyStorageCleanupRepositoryPort {
  private readonly storage: LegacyStorageCleanupStorageArea

  constructor(storage: LegacyStorageCleanupStorageArea) {
    this.storage = storage
  }

  readonly readMetadata = async (): Promise<
    LegacyStorageCleanupMetadata | undefined
  > => {
    try {
      const result = await this.storage.get(LEGACY_STORAGE_CLEANUP_METADATA_KEY)
      return Object.hasOwn(result, LEGACY_STORAGE_CLEANUP_METADATA_KEY)
        ? decodeMetadata(result[LEGACY_STORAGE_CLEANUP_METADATA_KEY])
        : undefined
    } catch (error) {
      throw toStorageError(error)
    }
  }

  readonly readRemainingLegacyKeys = async (): Promise<readonly string[]> => {
    try {
      const result = await this.storage.get(LEGACY_DOMAIN_STORAGE_KEYS)
      return LEGACY_DOMAIN_STORAGE_KEYS.filter((key) =>
        Object.hasOwn(result, key),
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  readonly removeLegacyDomainData = async (): Promise<void> => {
    try {
      await this.storage.remove(LEGACY_DOMAIN_STORAGE_KEYS)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  readonly saveMetadata = async (
    metadata: LegacyStorageCleanupMetadata,
  ): Promise<void> => {
    try {
      await this.storage.set({
        [LEGACY_STORAGE_CLEANUP_METADATA_KEY]: decodeMetadata(metadata),
      })
    } catch (error) {
      throw toStorageError(error)
    }
  }
}

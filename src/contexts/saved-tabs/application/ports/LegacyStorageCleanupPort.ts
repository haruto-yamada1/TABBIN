export const LEGACY_STORAGE_CLEANUP_METADATA_VERSION = 1

type LegacyStorageCleanupMetadataBase = {
  readonly migrationId: string
  readonly retentionStartedAt: number
  readonly version: typeof LEGACY_STORAGE_CLEANUP_METADATA_VERSION
}

export type LegacyStorageCleanupMetadata =
  | (LegacyStorageCleanupMetadataBase & {
      readonly status: 'retained' | 'eligible'
    })
  | (LegacyStorageCleanupMetadataBase & {
      readonly failedAt: number
      readonly status: 'failed'
    })
  | (LegacyStorageCleanupMetadataBase & {
      readonly completedAt: number
      readonly status: 'completed'
    })

export type LegacyStorageCleanupRepositoryPort = {
  readonly readMetadata: () => Promise<LegacyStorageCleanupMetadata | undefined>
  readonly readRemainingLegacyKeys: () => Promise<readonly string[]>
  readonly removeLegacyDomainData: () => Promise<void>
  readonly saveMetadata: (
    metadata: LegacyStorageCleanupMetadata,
  ) => Promise<void>
}

export const LEGACY_STORAGE_CLEANUP_ERROR_CODES = [
  'LEGACY_STORAGE_CLEANUP_KEYS_REMAIN',
  'LEGACY_STORAGE_CLEANUP_METADATA_INVALID',
  'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
  'LEGACY_STORAGE_CLEANUP_TARGET_UNAVAILABLE',
  'LEGACY_STORAGE_CLEANUP_TARGET_UNHEALTHY',
] as const

export type LegacyStorageCleanupErrorCode =
  (typeof LEGACY_STORAGE_CLEANUP_ERROR_CODES)[number]

export class LegacyStorageCleanupError extends Error {
  readonly code: LegacyStorageCleanupErrorCode

  constructor(code: LegacyStorageCleanupErrorCode, options?: ErrorOptions) {
    super(`Legacy storage cleanup failed (${code}).`, options)
    this.code = code
    this.name = 'LegacyStorageCleanupError'
  }
}

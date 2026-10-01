import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type {
  LegacyStorageCleanupMetadata,
  LegacyStorageCleanupRepositoryPort,
} from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type {
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2VerifiedMigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

const DAYS_IN_GRACE_PERIOD = 30
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1_000

export const LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS =
  DAYS_IN_GRACE_PERIOD *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND

export type LegacyStorageCleanupRunResult = 'completed' | 'retained' | 'skipped'

export type LegacyStorageCleanupServiceOptions = {
  readonly clock: ClockPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly coordination: PersistenceCoordinationPort
  readonly repository: LegacyStorageCleanupRepositoryPort
  readonly target: PersistenceV2VerifiedMigrationTargetPort
}

export class LegacyStorageCleanupService {
  private readonly options: LegacyStorageCleanupServiceOptions

  constructor(options: LegacyStorageCleanupServiceOptions) {
    this.options = options
  }

  readonly run = async (): Promise<LegacyStorageCleanupRunResult> =>
    this.options.coordination.runExclusive(async () => this.runExclusive())

  private readonly runExclusive =
    async (): Promise<LegacyStorageCleanupRunResult> => {
      const controlState = await this.options.controlStateRepository.read()
      if (controlState.status !== 'indexeddb') {
        return 'skipped'
      }

      const now = this.readCurrentTime()
      const metadata = await this.readMetadata()
      if (!metadata || metadata.migrationId !== controlState.migrationId) {
        await this.saveMetadata({
          migrationId: controlState.migrationId,
          retentionStartedAt: now,
          status: 'retained',
          version: 1,
        })
        return 'retained'
      }

      if (metadata.status === 'completed') {
        return 'completed'
      }
      if (
        now < metadata.retentionStartedAt ||
        now - metadata.retentionStartedAt <
          LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS
      ) {
        return 'retained'
      }

      try {
        await this.verifyTarget(controlState.migrationId)
        await this.saveMetadata({
          migrationId: controlState.migrationId,
          retentionStartedAt: metadata.retentionStartedAt,
          status: 'eligible',
          version: 1,
        })
        await this.removeLegacyDomainData()
        const remainingKeys = await this.readRemainingLegacyKeys()
        if (remainingKeys.length > 0) {
          throw new LegacyStorageCleanupError(
            'LEGACY_STORAGE_CLEANUP_KEYS_REMAIN',
          )
        }
        await this.verifyTarget(controlState.migrationId)
        await this.saveMetadata({
          completedAt: now,
          migrationId: controlState.migrationId,
          retentionStartedAt: metadata.retentionStartedAt,
          status: 'completed',
          version: 1,
        })
        return 'completed'
      } catch (error) {
        const cleanupError = this.toCleanupError(error)
        await this.saveFailedMetadata(metadata, now, cleanupError)
        throw cleanupError
      }
    }

  private readonly readCurrentTime = (): number => {
    const now = this.options.clock.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_METADATA_INVALID',
      )
    }
    return now
  }

  private readonly readMetadata = async (): Promise<
    LegacyStorageCleanupMetadata | undefined
  > => {
    try {
      return await this.options.repository.readMetadata()
    } catch (error) {
      throw this.toCleanupError(error)
    }
  }

  private readonly saveMetadata = async (
    metadata: LegacyStorageCleanupMetadata,
  ): Promise<void> => {
    try {
      await this.options.repository.saveMetadata(metadata)
    } catch (error) {
      throw this.toCleanupError(error)
    }
  }

  private readonly removeLegacyDomainData = async (): Promise<void> => {
    try {
      await this.options.repository.removeLegacyDomainData()
    } catch (error) {
      throw this.toCleanupError(error)
    }
  }

  private readonly readRemainingLegacyKeys = async (): Promise<
    readonly string[]
  > => {
    try {
      return await this.options.repository.readRemainingLegacyKeys()
    } catch (error) {
      throw this.toCleanupError(error)
    }
  }

  private readonly verifyTarget = async (
    migrationId: string,
  ): Promise<void> => {
    let snapshot
    try {
      snapshot = await this.options.target.readVerifiedSnapshot(migrationId)
    } catch (error) {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_TARGET_UNAVAILABLE',
        { cause: error },
      )
    }
    if (!checkPersistenceIntegrity(snapshot.savedTabs).isHealthy) {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_TARGET_UNHEALTHY',
      )
    }
  }

  private readonly saveFailedMetadata = async (
    metadata: Exclude<LegacyStorageCleanupMetadata, { status: 'completed' }>,
    failedAt: number,
    cause: LegacyStorageCleanupError,
  ): Promise<void> => {
    try {
      await this.saveMetadata({
        failedAt,
        migrationId: metadata.migrationId,
        retentionStartedAt: metadata.retentionStartedAt,
        status: 'failed',
        version: 1,
      })
    } catch (error) {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
        {
          cause: new AggregateError(
            [cause, error],
            'Failed to persist legacy storage cleanup failure metadata.',
          ),
        },
      )
    }
  }

  private readonly toCleanupError = (
    error: unknown,
  ): LegacyStorageCleanupError =>
    error instanceof LegacyStorageCleanupError
      ? error
      : new LegacyStorageCleanupError(
          'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
          { cause: error },
        )
}

export { LegacyStorageCleanupError }

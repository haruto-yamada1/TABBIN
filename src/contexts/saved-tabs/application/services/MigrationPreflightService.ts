import { analyzeLegacyMigrationPreflight } from '@/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper'
import {
  MIGRATION_PREFLIGHT_VERSION,
  MIGRATION_SOURCE_FINGERPRINT_VERSION,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  MigrationPreflightDiagnostic,
  MigrationPreflightIssueCode,
  MigrationPreflightRepositoryPort,
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
  MigrationSourceFingerprintPort,
  StoredMigrationPreflight,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceCoordinationPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MigrationSourceReadError } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  RawLegacyStorageReaderPort,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  PersistenceCapacityPlan,
  PersistenceStorageEstimatePort,
} from '@/lib/persistence/capacity'
import { runPersistenceCapacityPreflight } from '@/lib/persistence/capacity'

export type MigrationPreflightServiceOptions = {
  readonly capacityPolicy: Pick<
    PersistenceCapacityPlan,
    'minimumReserveBytes' | 'reserveRatio'
  >
  readonly coordination: PersistenceCoordinationPort
  readonly estimateStorage: PersistenceStorageEstimatePort
  readonly fingerprint: MigrationSourceFingerprintPort
  readonly now: () => number
  readonly rawReader: RawLegacyStorageReaderPort
  readonly repository: MigrationPreflightRepositoryPort
}

const UNAVAILABLE_SOURCE_FINGERPRINT = 'unavailable'

const toPublicStatus = (
  record: StoredMigrationPreflight,
): MigrationPreflightStatus => {
  const { sourceFingerprint: _sourceFingerprint, ...status } = record
  return status
}

const createEmptyDiagnostic = (
  issueCodes: readonly MigrationPreflightIssueCode[],
): MigrationPreflightDiagnostic => ({
  capacityStatus: 'blocked',
  collisionCount: 0,
  entityCounts: {},
  issueCodes,
  preflightVersion: MIGRATION_PREFLIGHT_VERSION,
  sourceFingerprintVersion: MIGRATION_SOURCE_FINGERPRINT_VERSION,
})

export class MigrationPreflightApprovalError extends Error {
  readonly code = 'MIGRATION_PREFLIGHT_STALE'

  constructor() {
    super('MIGRATION_PREFLIGHT_STALE')
    this.name = 'MigrationPreflightApprovalError'
  }
}

export class MigrationPreflightService implements MigrationPreflightServicePort {
  private readonly options: MigrationPreflightServiceOptions

  constructor(options: MigrationPreflightServiceOptions) {
    this.options = options
  }

  readonly createCurrentDataBackup =
    async (): Promise<RawLegacyStorageSnapshot> =>
      this.options.coordination.runExclusive(async () =>
        this.options.rawReader.readSnapshot(),
      )

  readonly readHealthySourceFingerprint = async (): Promise<string> => {
    const status = await this.readStatus()
    if (status.status !== 'healthy') {
      throw new MigrationPreflightApprovalError()
    }
    const record = await this.options.repository.read()
    if (record?.status !== 'healthy') {
      throw new MigrationPreflightApprovalError()
    }
    return record.sourceFingerprint
  }

  readonly readStatus = async (): Promise<MigrationPreflightStatus> => {
    const record = await this.options.repository.read()
    if (!record) {
      return { status: 'not-run' }
    }
    if (record.sourceFingerprint === UNAVAILABLE_SOURCE_FINGERPRINT) {
      return toPublicStatus(record)
    }

    try {
      return await this.options.coordination.runExclusive(async () => {
        const current = await this.captureSource()
        if (current.fingerprint === record.sourceFingerprint) {
          return toPublicStatus(record)
        }
        return this.saveStale(record)
      })
    } catch (error) {
      return this.saveReadFailure(error)
    }
  }

  readonly run = async (): Promise<MigrationPreflightStatus> => {
    let captured: {
      readonly fingerprint: string
      readonly source: RawLegacyStorageSnapshot
    }
    try {
      captured = await this.options.coordination.runExclusive(async () =>
        this.captureSource(),
      )
    } catch (error) {
      return this.saveReadFailure(error)
    }

    let analysis: ReturnType<typeof analyzeLegacyMigrationPreflight>
    try {
      analysis = analyzeLegacyMigrationPreflight(captured.source)
    } catch {
      return this.saveBlocked(
        captured.fingerprint,
        createEmptyDiagnostic(['MIGRATION_SOURCE_INVALID_TYPE']),
        ['MIGRATION_SOURCE_INVALID_TYPE'],
      )
    }

    const targetExpansionRatio = Math.max(
      1,
      analysis.targetSerializedBytes / analysis.approximateSourceBytes,
    )
    const capacity = await runPersistenceCapacityPreflight(
      {
        ...this.options.capacityPolicy,
        sourceEntityCounts: analysis.entityCounts,
        sourceSerializedBytes: analysis.approximateSourceBytes,
        targetExpansionRatio,
      },
      this.options.estimateStorage,
    )
    const capacityIssueCodes =
      capacity.status === 'blocked' ? [capacity.errorCode] : []
    const issueCodes = [...analysis.issueCodes, ...capacityIssueCodes]
    const blockingIssueCodes: MigrationPreflightIssueCode[] = []
    for (const issue of analysis.issues) {
      if (issue.code !== 'MIGRATION_SOURCE_MISSING_KEY') {
        blockingIssueCodes.push(issue.code)
      }
    }
    blockingIssueCodes.push(...capacityIssueCodes)
    const diagnostic: MigrationPreflightDiagnostic = {
      capacityStatus: capacity.status,
      collisionCount: analysis.collisionCount,
      entityCounts: analysis.entityCounts,
      issueCodes,
      preflightVersion: MIGRATION_PREFLIGHT_VERSION,
      sourceFingerprintVersion: MIGRATION_SOURCE_FINGERPRINT_VERSION,
    }
    const checkedAt = this.options.now()

    try {
      return await this.options.coordination.runExclusive(async () => {
        const current = await this.captureSource()
        if (current.fingerprint !== captured.fingerprint) {
          return this.saveStale({
            checkedAt,
            diagnostic,
            sourceFingerprint: captured.fingerprint,
            status: 'healthy',
          })
        }
        const record: StoredMigrationPreflight =
          blockingIssueCodes.length > 0
            ? {
                checkedAt,
                diagnostic,
                issueCodes: blockingIssueCodes,
                sourceFingerprint: captured.fingerprint,
                status: 'blocked',
              }
            : {
                checkedAt,
                diagnostic,
                sourceFingerprint: captured.fingerprint,
                status: 'healthy',
              }
        await this.options.repository.save(record)
        return toPublicStatus(record)
      })
    } catch (error) {
      return this.saveReadFailure(error)
    }
  }

  private readonly captureSource = async (): Promise<{
    readonly fingerprint: string
    readonly source: RawLegacyStorageSnapshot
  }> => {
    const source = await this.options.rawReader.readSnapshot()
    let fingerprint: string
    try {
      fingerprint = await this.options.fingerprint.create(source)
    } catch (error) {
      throw new MigrationSourceReadError('MIGRATION_SOURCE_INVALID_TYPE', {
        cause: error,
      })
    }
    return {
      fingerprint,
      source,
    }
  }

  private readonly saveBlocked = async (
    sourceFingerprint: string,
    diagnostic: MigrationPreflightDiagnostic,
    issueCodes: readonly MigrationPreflightIssueCode[],
  ): Promise<MigrationPreflightStatus> => {
    const record: StoredMigrationPreflight = {
      checkedAt: this.options.now(),
      diagnostic,
      issueCodes,
      sourceFingerprint,
      status: 'blocked',
    }
    await this.options.coordination.runExclusive(async () =>
      this.options.repository.save(record),
    )
    return toPublicStatus(record)
  }

  private readonly saveReadFailure = async (
    error: unknown,
  ): Promise<MigrationPreflightStatus> => {
    const issueCode: MigrationPreflightIssueCode =
      error instanceof MigrationSourceReadError
        ? error.code
        : 'MIGRATION_SOURCE_READ_FAILED'
    return this.saveBlocked(
      UNAVAILABLE_SOURCE_FINGERPRINT,
      createEmptyDiagnostic([issueCode]),
      [issueCode],
    )
  }

  private readonly saveStale = async (
    previous: StoredMigrationPreflight,
  ): Promise<MigrationPreflightStatus> => {
    const record: StoredMigrationPreflight = {
      checkedAt: previous.checkedAt,
      diagnostic: previous.diagnostic,
      sourceFingerprint: previous.sourceFingerprint,
      status: 'stale',
    }
    await this.options.repository.save(record)
    return toPublicStatus(record)
  }
}

import { mapLegacyStorageToPersistenceV2 } from '@/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper'
import type {
  MigrationPreflightAnalysis,
  PersistenceV2MigrationTarget,
} from '@/contexts/saved-tabs/application/mappers/LegacyStorageToPersistenceV2Mapper'
import {
  MIGRATION_PREFLIGHT_VERSION,
  MIGRATION_SOURCE_FINGERPRINT_VERSION,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  MigrationPreflightReaderPort,
  MigrationSourceFingerprintPort,
  StoredMigrationPreflight,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  PersistenceMigrationRecoveryLifecyclePort,
  PersistenceV2MigrationDiagnostic,
  PersistenceV2MigrationErrorCode,
  PersistenceV2MigrationReport,
  PersistenceV2MigrationStage,
} from '@/contexts/saved-tabs/application/ports/PersistenceMigrationRecoveryPort'
import type { PersistenceV2MigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type { PersistenceV2WritePlan } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { RawLegacyStorageReaderPort } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

export type PersistenceV2MigrationServiceOptions = {
  readonly batchSize?: number
  readonly fingerprint: MigrationSourceFingerprintPort
  readonly preflightRepository: MigrationPreflightReaderPort
  readonly rawReader: RawLegacyStorageReaderPort
  readonly target: PersistenceV2MigrationTargetPort
}

const DEFAULT_MIGRATION_BATCH_SIZE = 1_000

export class PersistenceV2MigrationError extends Error {
  readonly code: PersistenceV2MigrationErrorCode

  constructor(code: PersistenceV2MigrationErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.code = code
    this.name = 'PersistenceV2MigrationError'
  }
}

const compareKeys = (left: string, right: string): number => {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

const byId = <Value extends { readonly id: string }>(
  left: Value,
  right: Value,
): number => compareKeys(left.id, right.id)

const canonicalSavedTabs = (
  snapshot: PersistenceV2Snapshot,
): PersistenceV2Snapshot => ({
  categories: snapshot.categories.toSorted((left, right) =>
    compareKeys(
      `${left.collectionId}\u0000${left.id}`,
      `${right.collectionId}\u0000${right.id}`,
    ),
  ),
  collections: snapshot.collections.toSorted(byId),
  groups: snapshot.groups.toSorted(byId),
  memberships: snapshot.memberships.toSorted((left, right) =>
    compareKeys(
      `${left.collectionId}\u0000${left.urlId}`,
      `${right.collectionId}\u0000${right.urlId}`,
    ),
  ),
  urls: snapshot.urls.toSorted(byId),
})

const canonicalSnapshot = (
  snapshot: Omit<PersistenceLogicalSnapshot, 'revision'>,
): Omit<PersistenceLogicalSnapshot, 'revision'> => ({
  analyticsViews: snapshot.analyticsViews.toSorted(byId),
  conversations: snapshot.conversations.toSorted(byId),
  messages: snapshot.messages.toSorted((left, right) =>
    compareKeys(
      `${left.conversationId}\u0000${left.id}`,
      `${right.conversationId}\u0000${right.id}`,
    ),
  ),
  savedTabs: canonicalSavedTabs(snapshot.savedTabs),
})

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([left], [right]) => compareKeys(left, right))
      .map(([key, entry]) => [key, sortObjectKeys(entry)]),
  )
}

const isSemanticallyEqual = (
  expected: PersistenceV2MigrationTarget,
  actual: PersistenceLogicalSnapshot,
): boolean =>
  JSON.stringify(sortObjectKeys(canonicalSnapshot(expected))) ===
  JSON.stringify(
    sortObjectKeys(
      canonicalSnapshot({
        analyticsViews: actual.analyticsViews,
        conversations: actual.conversations,
        messages: actual.messages,
        savedTabs: actual.savedTabs,
      }),
    ),
  )

const batch = <Value>(
  values: readonly Value[],
  batchSize: number,
  createPlan: (items: readonly Value[]) => PersistenceV2WritePlan,
): PersistenceV2WritePlan[] => {
  const plans: PersistenceV2WritePlan[] = []
  for (let offset = 0; offset < values.length; offset += batchSize) {
    plans.push(createPlan(values.slice(offset, offset + batchSize)))
  }
  return plans
}

const createWriteBatches = (
  target: PersistenceV2MigrationTarget,
  batchSize: number,
): readonly PersistenceV2WritePlan[] => [
  ...batch(target.savedTabs.groups, batchSize, (put) => ({
    groups: { put },
  })),
  ...batch(target.savedTabs.collections, batchSize, (put) => ({
    collections: { put },
  })),
  ...batch(target.savedTabs.urls, batchSize, (put) => ({ urls: { put } })),
  ...batch(target.savedTabs.categories, batchSize, (put) => ({
    categories: { put },
  })),
  ...batch(target.savedTabs.memberships, batchSize, (put) => ({
    memberships: { put },
  })),
  ...batch(target.conversations, batchSize, (put) => ({
    conversations: { put },
  })),
  ...batch(target.messages, batchSize, (put) => ({ messages: { put } })),
  ...batch(target.analyticsViews, batchSize, (put) => ({
    analyticsViews: { put },
  })),
]

const assertApprovedPreflight = (
  record: StoredMigrationPreflight | undefined,
): StoredMigrationPreflight => {
  if (
    record?.status !== 'healthy' ||
    record.diagnostic.capacityStatus !== 'ready' ||
    record.diagnostic.preflightVersion !== MIGRATION_PREFLIGHT_VERSION ||
    record.diagnostic.sourceFingerprintVersion !==
      MIGRATION_SOURCE_FINGERPRINT_VERSION
  ) {
    throw new PersistenceV2MigrationError('MIGRATION_PREFLIGHT_NOT_APPROVED')
  }
  return record
}

const assertMigratable = (
  analysis: MigrationPreflightAnalysis,
): PersistenceV2MigrationTarget => {
  if (analysis.issues.some(({ severity }) => severity === 'error')) {
    throw new PersistenceV2MigrationError('MIGRATION_SOURCE_BLOCKED')
  }
  return analysis.target
}

type MigrationSourceDiagnosticSummary = Pick<
  MigrationPreflightAnalysis,
  'approximateSourceBytes' | 'entityCounts' | 'issues'
>

const toDiagnosticSummary = (
  analysis: MigrationPreflightAnalysis,
): MigrationSourceDiagnosticSummary => ({
  approximateSourceBytes: analysis.approximateSourceBytes,
  entityCounts: { ...analysis.entityCounts },
  issues: analysis.issues.map((issue) => ({ ...issue })),
})

const createReport = (
  migrationId: string,
  analysis: MigrationPreflightAnalysis,
): PersistenceV2MigrationReport => ({
  collisionCount: analysis.collisionCount,
  migratedAnalyticsViewCount: analysis.target.analyticsViews.length,
  migratedCategoryCount: analysis.target.savedTabs.categories.length,
  migratedCollectionCount: analysis.target.savedTabs.collections.length,
  migratedConversationCount: analysis.target.conversations.length,
  migratedGroupCount: analysis.target.savedTabs.groups.length,
  migratedMembershipCount: analysis.target.savedTabs.memberships.length,
  migratedMessageCount: analysis.target.messages.length,
  migratedUrlCount: analysis.target.savedTabs.urls.length,
  migrationId,
  sourceEntityCounts: { ...analysis.entityCounts },
  timestampMigrationSummary: analysis.timestampMigrationSummary,
  warningCounts: analysis.issues
    .filter(({ severity }) => severity === 'warning')
    .map(({ code, occurrenceCount }) => ({ code, occurrenceCount })),
})

export class PersistenceV2MigrationService implements PersistenceMigrationRecoveryLifecyclePort {
  private readonly batchSize: number
  private failureDiagnostic: PersistenceV2MigrationDiagnostic | undefined
  private lastObservedSource:
    | {
        readonly analysis: MigrationSourceDiagnosticSummary
        readonly fingerprint: string
      }
    | undefined
  private readonly options: PersistenceV2MigrationServiceOptions
  private readonly reports = new Map<string, PersistenceV2MigrationReport>()

  constructor(options: PersistenceV2MigrationServiceOptions) {
    this.options = options
    this.batchSize = Math.max(
      1,
      Math.trunc(options.batchSize ?? DEFAULT_MIGRATION_BATCH_SIZE),
    )
  }

  readonly readCurrentSourceFingerprint = async (): Promise<string> => {
    const source = await this.options.rawReader.readSnapshot()
    const analysis = mapLegacyStorageToPersistenceV2(source)
    const fingerprint = await this.options.fingerprint.create(source)
    this.lastObservedSource = {
      analysis: toDiagnosticSummary(analysis),
      fingerprint,
    }
    return fingerprint
  }

  readonly readPreflightSourceFingerprint = async (
    migrationId: string,
  ): Promise<string> => {
    try {
      const record = assertApprovedPreflight(
        await this.options.preflightRepository.read(),
      )
      if (
        this.lastObservedSource &&
        this.lastObservedSource.fingerprint !== record.sourceFingerprint
      ) {
        this.createFailure(
          migrationId,
          'preflight',
          'MIGRATION_SOURCE_CHANGED',
          { analysis: this.lastObservedSource.analysis },
        )
      }
      return record.sourceFingerprint
    } catch (error) {
      throw this.createFailure(
        migrationId,
        'preflight',
        'MIGRATION_PREFLIGHT_NOT_APPROVED',
        { cause: error },
      )
    }
  }

  readonly migrate = async (migrationId: string): Promise<void> => {
    const { analysis, target } = await this.readValidatedSource(
      migrationId,
      'preflight',
    )

    try {
      await this.options.target.prepare(migrationId)
      await createWriteBatches(target, this.batchSize).reduce(
        async (previous, plan) => {
          await previous
          return this.options.target.writeBatch(migrationId, plan)
        },
        Promise.resolve(),
      )
      await this.options.target.markWritten(migrationId)
    } catch (error) {
      throw this.createFailure(
        migrationId,
        'target-write',
        'MIGRATION_TARGET_WRITE_FAILED',
        { analysis, cause: error },
      )
    }
    this.reports.set(migrationId, createReport(migrationId, analysis))
    this.failureDiagnostic = undefined
  }

  readonly verify = async (migrationId: string): Promise<void> => {
    const { analysis, target: expected } = await this.readValidatedSource(
      migrationId,
      'verification',
    )

    let actual: PersistenceLogicalSnapshot
    try {
      actual = await this.options.target.readSnapshot(migrationId)
    } catch (error) {
      throw this.createFailure(
        migrationId,
        'target-read',
        'MIGRATION_TARGET_READ_FAILED',
        { analysis, cause: error },
      )
    }
    const integrity = checkPersistenceIntegrity(actual.savedTabs)
    if (
      integrity.issues.some(({ severity }) => severity === 'error') ||
      !isSemanticallyEqual(expected, actual)
    ) {
      throw this.createFailure(
        migrationId,
        'verification',
        'MIGRATION_SEMANTIC_VERIFICATION_FAILED',
        { analysis },
      )
    }
    await this.options.target.markVerified(migrationId)
    this.reports.set(migrationId, createReport(migrationId, analysis))
    this.failureDiagnostic = undefined
  }

  readonly readReport = (
    migrationId: string,
  ): PersistenceV2MigrationReport | undefined => this.reports.get(migrationId)

  readonly readFailureDiagnostic = ():
    | PersistenceV2MigrationDiagnostic
    | undefined => this.failureDiagnostic

  private readonly readValidatedSource = async (
    migrationId: string,
    fingerprintStage: Extract<
      PersistenceV2MigrationStage,
      'preflight' | 'verification'
    >,
  ): Promise<{
    readonly analysis: MigrationPreflightAnalysis
    readonly target: PersistenceV2MigrationTarget
  }> => {
    const source = await this.options.rawReader.readSnapshot()
    const analysis = mapLegacyStorageToPersistenceV2(source)
    let target: PersistenceV2MigrationTarget
    try {
      target = assertMigratable(analysis)
    } catch (error) {
      throw this.createFailure(
        migrationId,
        'source-map',
        'MIGRATION_SOURCE_BLOCKED',
        { analysis, cause: error },
      )
    }
    const approvedFingerprint =
      await this.readPreflightSourceFingerprint(migrationId)
    const currentFingerprint = await this.options.fingerprint.create(source)
    if (currentFingerprint !== approvedFingerprint) {
      throw this.createFailure(
        migrationId,
        fingerprintStage,
        'MIGRATION_SOURCE_CHANGED',
        { analysis },
      )
    }
    return { analysis, target }
  }

  private readonly createFailure = (
    migrationId: string,
    stage: PersistenceV2MigrationStage,
    errorCode: PersistenceV2MigrationErrorCode,
    details?: {
      readonly analysis?: MigrationSourceDiagnosticSummary
      readonly cause?: unknown
    },
  ): PersistenceV2MigrationError => {
    const analysis = details?.analysis
    this.failureDiagnostic = {
      errorCode,
      issueCodes: analysis?.issues.map(({ code }) => code).toSorted() ?? [],
      migrationId,
      sourceBytes: analysis?.approximateSourceBytes ?? 0,
      sourceEntityCounts: { ...analysis?.entityCounts },
      stage,
    }
    return new PersistenceV2MigrationError(errorCode, {
      cause: details?.cause,
    })
  }
}

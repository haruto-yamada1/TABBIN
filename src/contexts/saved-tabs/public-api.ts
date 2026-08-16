/**
 * `saved-tabs` context の公開 API。
 *
 * context 外のコード（legacy `src/features/**` や他の context）は
 * domain / application / infrastructure の内部実装へ直接依存せず、
 * このファイルが再公開する安定した面のみを参照する。
 *
 * 交差 context 依存もこのファイル経由のみを許可する
 * (`.dependency-cruiser.cjs` の `no-*-to-other-context-internal` 規則)。
 *
 * 公開するのは純粋関数・型・不変値のみとし、repository / port の
 * 実装詳細や branded entity の生成口は含めない。
 */

export { normalizeDomainString } from './domain/value-objects/DomainName'

export { mapLegacyStorageToPersistenceV2 } from './application/mappers/LegacyStorageToPersistenceV2Mapper'
export type { LegacyMigrationIssueCode } from './application/mappers/LegacyStorageToPersistenceV2Mapper'
export type {
  RawLegacyStorageSnapshot,
  RawLegacyStorageValue,
} from './application/ports/RawLegacyStorageReaderPort'
export type {
  CustomProject,
  DomainCategorySettings,
  DomainParentCategoryMapping,
  LegacyChromeStorageDto,
  ParentCategory,
  ProjectKeywordSettings,
  SubCategoryKeyword,
  TabGroup,
  UrlRecord,
} from './application/dto/LegacyChromeStorageDto'
export type { ClockPort } from './application/ports/ClockPort'
export type { IdGeneratorPort } from './application/ports/IdGeneratorPort'
export type {
  PersistenceChangeEvent,
  PersistenceChangePort,
  PersistenceChangeScope,
} from './application/ports/PersistenceChangePort'
export type {
  PersistenceRecoverySnapshotRecord,
  PersistenceRecoverySnapshotRepositoryPort,
  PersistenceRecoverySnapshotRetentionPolicy,
  PersistenceRecoverySnapshotSaveResult,
  PersistenceRecoverySnapshotSummary,
} from './application/ports/PersistenceRecoverySnapshotPort'
export { PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT_CODE } from './application/services/PersistenceMutationCoordinatorService'
export type {
  PersistenceNotificationFailureDiagnostic,
  PersistenceNotificationFailureStage,
} from './application/services/PersistenceMutationCoordinatorService'
export type {
  PersistenceLogicalSnapshot,
  PersistenceVersionedSavedTabsSnapshot,
} from './application/ports/PersistenceV2SnapshotReaderPort'
export type {
  PersistenceV2ReplacementErrorCode,
  PersistenceV2ReplacementPort,
  PersistenceV2ReplacementResult,
  PersistenceV2ReplacementTarget,
} from './application/ports/PersistenceV2ReplacementPort'
export type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from './application/ports/PersistenceV2UnitOfWorkPort'
export {
  PERSISTENCE_DATABASE_VERSION,
  PERSISTENCE_GENERATION,
} from './application/services/PersistenceReleasePolicyService'

// issue #639: settings defaults を public API 経由で提供する
export { savedTabsActionSettingsDefaults } from './domain/services/SavedTabsActionSettingsPolicy'
export {
  DEFAULT_EXCLUDE_PATTERNS,
  mergeStoredUserSettingsDefaults,
} from './domain/services/userSettingsDefaultsMerge'

export {
  PERSISTENCE_V2_INVARIANT_CODES,
  PERSISTENCE_V2_ORDERING_POLICY,
} from './domain/entities/PersistenceModelV2'
export type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionDefinition,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2InvariantCode,
  PersistenceV2ProjectKeywordSettings,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from './domain/entities/PersistenceModelV2'
export {
  checkPersistenceIntegrity,
  hasBlockingPersistenceIntegrityIssues,
  PERSISTENCE_V2_INVARIANT_POLICY,
} from './domain/services/PersistenceIntegrityChecker'
export type {
  IntegrityIssueSeverity,
  IntegrityRepairability,
  StorageIntegrityIssue,
  StorageIntegrityIssueDetails,
  StorageIntegrityReport,
} from './domain/services/PersistenceIntegrityChecker'
export { createStorageRepairPlan } from './domain/services/PersistenceRepairPlanner'
export type {
  StorageRepairOperation,
  StorageRepairPlan,
} from './domain/services/PersistenceRepairPlanner'

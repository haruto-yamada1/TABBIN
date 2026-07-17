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

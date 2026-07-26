import type { PersistenceMigrationLifecyclePort } from './PersistenceBootstrapPort'
import type {
  PersistenceV2MigrationDiagnostic,
  PersistenceV2MigrationReport,
} from './PersistenceRecoveryPort'

export {
  PERSISTENCE_V2_MIGRATION_ERROR_CODES,
  type PersistenceEmergencyBackup,
  type PersistenceV2MigrationDiagnostic,
  type PersistenceV2MigrationErrorCode,
  type PersistenceV2MigrationReport,
  type PersistenceV2MigrationStage,
} from './PersistenceRecoveryPort'

export type PersistenceMigrationRecoveryLifecyclePort =
  PersistenceMigrationLifecyclePort & {
    readonly readFailureDiagnostic: () =>
      | PersistenceV2MigrationDiagnostic
      | undefined
    readonly readReport: (
      migrationId: string,
    ) => PersistenceV2MigrationReport | undefined
  }

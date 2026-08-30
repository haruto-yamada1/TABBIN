import type { MigrationPreflightStatus } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceV2MigrationDiagnostic } from '@/contexts/saved-tabs/application/ports/PersistenceRecoveryPort'

import { PRODUCTION_PERSISTENCE_V2_MIGRATION_ID } from './createMigrationPreflightController'

type RecoverableMigrationPreflightStatus = Extract<
  MigrationPreflightStatus,
  { readonly status: 'blocked' | 'stale' }
>

export const createMigrationPreflightRecoveryDiagnostic = (
  status: RecoverableMigrationPreflightStatus,
): PersistenceV2MigrationDiagnostic => ({
  errorCode:
    status.status === 'blocked'
      ? 'MIGRATION_SOURCE_BLOCKED'
      : 'MIGRATION_SOURCE_CHANGED',
  issueCodes: [...status.diagnostic.issueCodes],
  migrationId: PRODUCTION_PERSISTENCE_V2_MIGRATION_ID,
  sourceBytes: 0,
  sourceEntityCounts: { ...status.diagnostic.entityCounts },
  stage: 'preflight',
})

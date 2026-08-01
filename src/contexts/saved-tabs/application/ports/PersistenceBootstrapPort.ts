import type {
  PersistenceEmergencyBackup,
  PersistenceV2MigrationDiagnostic,
} from './PersistenceRecoveryPort'

export const PERSISTENCE_BOOTSTRAP_ERROR_CODES = [
  'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
  'PERSISTENCE_CONTROL_STATE_INVALID',
  'PERSISTENCE_CONTROL_STATE_ACCESS_POLICY_FAILED',
  'PERSISTENCE_COORDINATION_UNAVAILABLE',
  'PERSISTENCE_PREFLIGHT_STALE',
  'PERSISTENCE_MIGRATION_FAILED',
  'PERSISTENCE_VERIFICATION_FAILED',
  'PERSISTENCE_RECOVERY_REQUIRED',
  'PERSISTENCE_READ_ONLY',
  'PERSISTENCE_ROUTE_MISMATCH',
  'PERSISTENCE_INVALID_TRANSITION',
] as const

export type PersistenceBootstrapErrorCode =
  (typeof PERSISTENCE_BOOTSTRAP_ERROR_CODES)[number]

export type PersistenceRoute = 'indexeddb' | 'legacy'

export type PersistenceControlState =
  | { readonly status: 'legacy' }
  | {
      readonly status: 'migrating'
      readonly migrationId: string
    }
  | {
      readonly status: 'verifying'
      readonly migrationId: string
    }
  | {
      readonly status: 'cutover-pending'
      readonly migrationId: string
    }
  | {
      readonly status: 'indexeddb'
      readonly migrationId: string
      readonly persistenceGeneration: 2
    }
  | {
      readonly status: 'failed'
      readonly migrationId?: string
      readonly errorCode: PersistenceBootstrapErrorCode
    }
  | {
      readonly status: 'read-only-emergency'
      readonly readSource: 'legacy'
      readonly migrationId?: string
    }
  | {
      readonly status: 'read-only-emergency'
      readonly readSource: 'indexeddb'
      readonly migrationId: string
      readonly persistenceGeneration: 2
    }

export type PersistenceControlStateTransition =
  | {
      readonly type: 'begin-migration'
      readonly migrationId: string
    }
  | {
      readonly type: 'begin-verification'
      readonly migrationId: string
    }
  | {
      readonly type: 'mark-cutover-pending'
      readonly migrationId: string
    }
  | {
      readonly type: 'complete-cutover'
      readonly migrationId: string
    }
  | {
      readonly type: 'fail'
      readonly migrationId?: string
      readonly errorCode: PersistenceBootstrapErrorCode
    }
  | {
      readonly type: 'enter-read-only-emergency'
      readonly readSource: 'legacy'
      readonly migrationId?: string
    }
  | {
      readonly type: 'enter-read-only-emergency'
      readonly readSource: 'indexeddb'
      readonly migrationId: string
    }
  | {
      readonly type: 'exit-read-only-emergency'
      readonly readSource: 'indexeddb'
      readonly migrationId: string
    }

export type PersistenceControlStateAccessPort = {
  readonly initialize: () => Promise<void>
}

export type PersistenceControlStateRepositoryPort = {
  readonly read: () => Promise<PersistenceControlState>
  readonly transition: (
    transition: PersistenceControlStateTransition,
  ) => Promise<PersistenceControlState>
}

export type PersistenceCoordinationPort = {
  readonly runExclusive: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runShared: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
}

export type PersistenceMigrationLifecyclePort = {
  readonly readCurrentSourceFingerprint: () => Promise<string>
  readonly readPreflightSourceFingerprint: (
    migrationId: string,
  ) => Promise<string>
  readonly migrate: (migrationId: string) => Promise<void>
  readonly verify: (migrationId: string) => Promise<void>
}

export type PersistenceBootstrapPort = {
  readonly migrate: (migrationId: string) => Promise<void>
  readonly readState: () => Promise<PersistenceControlState>
  readonly ready: () => Promise<void>
}

export type PersistenceOperationGatePort = {
  readonly runIndexedDbRead: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runIndexedDbWrite: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runLegacyRead: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runLegacyWrite: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
}

/**
 * A pair of repository operations for one logical read or write.
 *
 * The router invokes exactly one callback after resolving the authoritative
 * persistence route. Callers must keep backend-specific shapes inside these
 * callbacks and expose only application/domain values as `Result`.
 */
export type PersistenceDataPlaneOperation<Result> = {
  readonly indexeddb: () => Promise<Result>
  readonly legacy: () => Promise<Result>
}

/**
 * Resolves the authoritative repository from the persistence control state.
 *
 * Unlike `PersistenceOperationGatePort`, callers do not preselect a route.
 * This prevents a matching-state call from producing
 * `PERSISTENCE_ROUTE_MISMATCH` and gives current use-cases one fail-closed
 * data-plane entry point.
 */
export type PersistenceDataPlaneRouterPort = {
  readonly read: <Result>(
    operation: PersistenceDataPlaneOperation<Result>,
  ) => Promise<Result>
  readonly write: <Result>(
    operation: PersistenceDataPlaneOperation<Result>,
  ) => Promise<Result>
}

export type PersistenceRecoveryState =
  | { readonly status: 'available' }
  | {
      readonly diagnostic?: PersistenceV2MigrationDiagnostic
      readonly status: 'unavailable'
      readonly errorCode: PersistenceBootstrapErrorCode
    }

export type PersistenceRecoveryReporterPort = {
  readonly reportUnavailable: (errorCode: PersistenceBootstrapErrorCode) => void
}

export type PersistenceBootstrapRecoveryControllerPort =
  PersistenceRecoveryReporterPort & {
    readonly clear: () => void
    readonly getSnapshot: () => PersistenceRecoveryState
    readonly retry: () => Promise<void>
    readonly subscribe: (listener: () => void) => () => void
  }

export type PersistenceRecoveryControllerPort =
  PersistenceBootstrapRecoveryControllerPort & {
    readonly createEmergencyBackup: () => Promise<PersistenceEmergencyBackup>
    readonly rerunPreflightAndRetry: () => Promise<void>
  }

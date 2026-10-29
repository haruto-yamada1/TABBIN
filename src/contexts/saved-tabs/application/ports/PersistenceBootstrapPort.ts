export const PERSISTENCE_BOOTSTRAP_ERROR_CODES = [
  'PERSISTENCE_COORDINATION_UNAVAILABLE',
  'PERSISTENCE_RECOVERY_REQUIRED',
] as const

export type PersistenceBootstrapErrorCode =
  (typeof PERSISTENCE_BOOTSTRAP_ERROR_CODES)[number]

export type PersistenceCoordinationPort = {
  readonly runExclusive: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runShared: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
}

export type PersistenceBootstrapPort = {
  readonly ready: () => Promise<void>
}

export type PersistenceOperationGatePort = {
  readonly runIndexedDbRead: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
  readonly runIndexedDbWrite: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>
}

export type PersistenceRecoveryState =
  | { readonly status: 'available' }
  | {
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
  PersistenceBootstrapRecoveryControllerPort

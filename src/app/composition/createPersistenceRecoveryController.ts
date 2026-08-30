import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { MigrationPreflightServicePort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  PersistenceBootstrapRecoveryControllerPort,
  PersistenceRecoveryControllerPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getMigrationPreflightRuntime } from '@/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

import { createMigrationPreflightRecoveryDiagnostic } from './createMigrationPreflightRecoveryDiagnostic'

export type PersistenceRecoveryControllerOptions = {
  readonly bootstrapRecovery: PersistenceBootstrapRecoveryControllerPort
  readonly now: () => number
  readonly preflight: MigrationPreflightServicePort
}

export const createPersistenceRecoveryController = (
  options: PersistenceRecoveryControllerOptions,
): PersistenceRecoveryControllerPort => ({
  clear: options.bootstrapRecovery.clear,
  createEmergencyBackup: async () => ({
    createdAt: options.now(),
    format: 'tabbin-legacy-emergency-backup',
    rawLegacyStorage: await options.preflight.createCurrentDataBackup(),
    version: 1,
    warning: 'contains-private-user-data',
  }),
  getSnapshot: options.bootstrapRecovery.getSnapshot,
  reportUnavailable: options.bootstrapRecovery.reportUnavailable,
  rerunPreflightAndRetry: async () => {
    const status = await options.preflight.run()
    if (status.status === 'blocked' || status.status === 'stale') {
      const errorCode =
        status.status === 'blocked'
          ? 'PERSISTENCE_PREFLIGHT_BLOCKED'
          : 'PERSISTENCE_PREFLIGHT_STALE'
      options.bootstrapRecovery.reportUnavailable(
        errorCode,
        createMigrationPreflightRecoveryDiagnostic(status),
      )
      throw new PersistenceUnavailableError(errorCode)
    }
    if (status.status !== 'healthy') {
      options.bootstrapRecovery.reportUnavailable('PERSISTENCE_PREFLIGHT_STALE')
      throw new PersistenceUnavailableError('PERSISTENCE_PREFLIGHT_STALE')
    }
    await options.bootstrapRecovery.retry()
  },
  retry: options.bootstrapRecovery.retry,
  subscribe: options.bootstrapRecovery.subscribe,
})

let controller: PersistenceRecoveryControllerPort | undefined

export const getPersistenceRecoveryController =
  (): PersistenceRecoveryControllerPort => {
    controller ??= createPersistenceRecoveryController({
      bootstrapRecovery: getPersistenceBootstrapRuntime().recovery,
      now: Date.now,
      preflight: getMigrationPreflightRuntime().service,
    })
    return controller
  }

export const resetPersistenceRecoveryControllerForTesting = (): void => {
  controller = undefined
}

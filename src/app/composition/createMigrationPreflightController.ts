import type {
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type {
  PersistenceBootstrapPort,
  PersistenceControlState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getMigrationPreflightRuntime } from '@/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export const PRODUCTION_PERSISTENCE_V2_MIGRATION_ID =
  'persistence-v2-production'

export type MigrationPreflightControllerResult =
  | Exclude<MigrationPreflightStatus, { readonly status: 'healthy' }>
  | PersistenceControlState

export type MigrationPreflightController = {
  readonly run: () => Promise<MigrationPreflightControllerResult>
}

export type MigrationPreflightControllerOptions = {
  readonly bootstrap: Pick<
    PersistenceBootstrapPort,
    'migrate' | 'readState' | 'ready'
  >
  readonly migrationId: string
  readonly service: MigrationPreflightServicePort
}

export const createMigrationPreflightController = (
  options: MigrationPreflightControllerOptions,
): MigrationPreflightController => {
  let runPromise: Promise<MigrationPreflightControllerResult> | undefined

  const run = async (): Promise<MigrationPreflightControllerResult> => {
    let status = await options.service.readStatus()
    if (status.status !== 'healthy') {
      status = await options.service.run()
    }
    if (status.status !== 'healthy') {
      return status
    }

    const controlState = await options.bootstrap.readState()
    try {
      if (controlState.status === 'legacy') {
        await options.bootstrap.migrate(options.migrationId)
      } else {
        await options.bootstrap.ready()
      }
    } catch (error) {
      try {
        const failedState = await options.bootstrap.readState()
        if (failedState.status === 'failed') {
          return failedState
        }
      } catch {
        // Preserve the original lifecycle failure when control state is unreadable.
      }
      throw error
    }
    return options.bootstrap.readState()
  }

  return {
    run: async (): Promise<MigrationPreflightControllerResult> =>
      (runPromise ??= run()),
  }
}

let controller: MigrationPreflightController | undefined

export const getMigrationPreflightController =
  (): MigrationPreflightController => {
    const bootstrap = getPersistenceBootstrapRuntime().bootstrap
    controller ??= createMigrationPreflightController({
      bootstrap,
      migrationId: PRODUCTION_PERSISTENCE_V2_MIGRATION_ID,
      service: getMigrationPreflightRuntime().service,
    })
    return controller
  }

export const resetMigrationPreflightControllerForTesting = (): void => {
  controller = undefined
}

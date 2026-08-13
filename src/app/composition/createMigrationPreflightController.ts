import type { MigrationPreflightServicePort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceBootstrapPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getMigrationPreflightRuntime } from '@/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export const PRODUCTION_PERSISTENCE_V2_MIGRATION_ID =
  'persistence-v2-production'

export type MigrationPreflightController = {
  readonly run: () => Promise<void>
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
  let runPromise: Promise<void> | undefined

  const run = async (): Promise<void> => {
    let status = await options.service.readStatus()
    if (status.status !== 'healthy') {
      status = await options.service.run()
    }
    if (status.status !== 'healthy') {
      return
    }

    const controlState = await options.bootstrap.readState()
    if (controlState.status === 'legacy') {
      await options.bootstrap.migrate(options.migrationId)
      return
    }
    await options.bootstrap.ready()
  }

  return {
    run: async (): Promise<void> => (runPromise ??= run()),
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

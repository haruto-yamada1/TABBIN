import type { MigrationPreflightServicePort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import { getMigrationPreflightRuntime } from '@/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime'

export type MigrationPreflightController = {
  readonly run: () => Promise<void>
}

export type MigrationPreflightControllerOptions = {
  readonly service: MigrationPreflightServicePort
}

export const createMigrationPreflightController = (
  options: MigrationPreflightControllerOptions,
): MigrationPreflightController => {
  let started = false

  return {
    run: async (): Promise<void> => {
      if (started) {
        return
      }
      started = true

      const status = await options.service.readStatus()
      if (status.status !== 'healthy') {
        await options.service.run()
      }
    },
  }
}

let controller: MigrationPreflightController | undefined

export const getMigrationPreflightController =
  (): MigrationPreflightController => {
    controller ??= createMigrationPreflightController({
      service: getMigrationPreflightRuntime().service,
    })
    return controller
  }

export const resetMigrationPreflightControllerForTesting = (): void => {
  controller = undefined
}

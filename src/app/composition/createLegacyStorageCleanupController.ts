import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type { LegacyStorageCleanupErrorCode } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type { LegacyStorageCleanupRunResult } from '@/contexts/saved-tabs/application/services/LegacyStorageCleanupService'
import { getLegacyStorageCleanupRuntime } from '@/contexts/saved-tabs/infrastructure/composition/legacyStorageCleanupRuntime'

export type LegacyStorageCleanupControllerResult =
  | { readonly status: LegacyStorageCleanupRunResult }
  | {
      readonly errorCode: LegacyStorageCleanupErrorCode
      readonly status: 'failed'
    }

export type LegacyStorageCleanupController = {
  readonly run: () => Promise<LegacyStorageCleanupControllerResult>
}

export type LegacyStorageCleanupControllerOptions = {
  readonly service: {
    readonly run: () => Promise<LegacyStorageCleanupRunResult>
  }
}

export const createLegacyStorageCleanupController = (
  options: LegacyStorageCleanupControllerOptions,
): LegacyStorageCleanupController => ({
  run: async (): Promise<LegacyStorageCleanupControllerResult> => {
    try {
      return { status: await options.service.run() }
    } catch (error) {
      if (error instanceof LegacyStorageCleanupError) {
        return { errorCode: error.code, status: 'failed' }
      }
      throw error
    }
  },
})

let controller: LegacyStorageCleanupController | undefined

export const getLegacyStorageCleanupController =
  (): LegacyStorageCleanupController => {
    controller ??= createLegacyStorageCleanupController({
      service: {
        run: async () => getLegacyStorageCleanupRuntime().service.run(),
      },
    })
    return controller
  }

export const resetLegacyStorageCleanupControllerForTesting = (): void => {
  controller = undefined
}

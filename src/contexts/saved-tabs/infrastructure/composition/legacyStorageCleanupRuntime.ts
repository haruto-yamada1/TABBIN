import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'
import type {
  PersistenceControlStateRepositoryPort,
  PersistenceCoordinationPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2VerifiedMigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import { LegacyStorageCleanupService } from '@/contexts/saved-tabs/application/services/LegacyStorageCleanupService'
import { createSystemClock } from '@/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter'
import { ChromeLegacyStorageCleanupRepository } from '@/contexts/saved-tabs/infrastructure/persistence/cleanup/ChromeLegacyStorageCleanupRepository'
import type { LegacyStorageCleanupStorageArea } from '@/contexts/saved-tabs/infrastructure/persistence/cleanup/ChromeLegacyStorageCleanupRepository'
import { IndexedDbPersistenceMigrationTarget } from '@/contexts/saved-tabs/infrastructure/persistence/migrations/IndexedDbPersistenceMigrationTarget'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

import { getPersistenceBootstrapRuntime } from './persistenceBootstrapRuntime'

export type LegacyStorageCleanupRuntimeOptions = {
  readonly clock: ClockPort
  readonly controlStateRepository: PersistenceControlStateRepositoryPort
  readonly coordination: PersistenceCoordinationPort
  readonly storage: LegacyStorageCleanupStorageArea
  readonly target: PersistenceV2VerifiedMigrationTargetPort
}

export type LegacyStorageCleanupRuntime = {
  readonly service: LegacyStorageCleanupService
}

export const createLegacyStorageCleanupRuntime = (
  options: LegacyStorageCleanupRuntimeOptions,
): LegacyStorageCleanupRuntime => ({
  service: new LegacyStorageCleanupService({
    clock: options.clock,
    controlStateRepository: options.controlStateRepository,
    coordination: options.coordination,
    repository: new ChromeLegacyStorageCleanupRepository(options.storage),
    target: options.target,
  }),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getDefaultStorage = (): LegacyStorageCleanupStorageArea => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new LegacyStorageCleanupError(
      'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
    )
  }
  return {
    get: async (keys) => {
      const selected = typeof keys === 'string' ? keys : [...keys]
      const result: unknown = await storage.get(selected)
      if (!isRecord(result)) {
        throw new Error('chrome.storage.local returned an invalid result.')
      }
      return result
    },
    remove: async (keys) => storage.remove([...keys]),
    set: async (values) => storage.set(values),
  }
}

let runtime: LegacyStorageCleanupRuntime | undefined

export const getLegacyStorageCleanupRuntime =
  (): LegacyStorageCleanupRuntime => {
    if (runtime) {
      return runtime
    }
    const persistenceRuntime = getPersistenceBootstrapRuntime()
    if (!persistenceRuntime.connectionManager) {
      throw new LegacyStorageCleanupError(
        'LEGACY_STORAGE_CLEANUP_TARGET_UNAVAILABLE',
      )
    }
    runtime = createLegacyStorageCleanupRuntime({
      clock: createSystemClock(),
      controlStateRepository: persistenceRuntime.controlStateRepository,
      coordination: persistenceRuntime.coordination,
      storage: getDefaultStorage(),
      target: new IndexedDbPersistenceMigrationTarget(
        persistenceRuntime.connectionManager,
      ),
    })
    return runtime
  }

export const resetLegacyStorageCleanupRuntimeForTesting = (): void => {
  runtime = undefined
}

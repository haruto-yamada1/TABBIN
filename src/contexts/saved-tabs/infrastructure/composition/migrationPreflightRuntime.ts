import type { MigrationPreflightServicePort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { PersistenceCoordinationPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MigrationPreflightService } from '@/contexts/saved-tabs/application/services/MigrationPreflightService'
import { ChromeRawLegacyStorageReader } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeRawLegacyStorageReader'
import { ChromeMigrationPreflightRepository } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromeMigrationPreflightRepository'
import { Sha256MigrationSourceFingerprint } from '@/contexts/saved-tabs/infrastructure/persistence/fingerprint/Sha256MigrationSourceFingerprint'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import type { PersistenceStorageEstimatePort } from '@/lib/persistence/capacity'

import { getPersistenceBootstrapRuntime } from './persistenceBootstrapRuntime'

const KIBIBYTE = 1024

export const MIGRATION_CAPACITY_MINIMUM_RESERVE_BYTES = KIBIBYTE * KIBIBYTE
export const MIGRATION_CAPACITY_RESERVE_RATIO = 0.2

export type MigrationPreflightStorage = {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

export type MigrationPreflightRuntimeOptions = {
  readonly coordination: PersistenceCoordinationPort
  readonly estimateStorage: PersistenceStorageEstimatePort
  readonly now: () => number
  readonly storage: MigrationPreflightStorage
}

export type MigrationPreflightRuntime = {
  readonly service: MigrationPreflightServicePort
}

export const createMigrationPreflightRuntime = (
  options: MigrationPreflightRuntimeOptions,
): MigrationPreflightRuntime => {
  const rawReader = new ChromeRawLegacyStorageReader({
    get: async (keys) => options.storage.get(keys),
  })
  const repository = new ChromeMigrationPreflightRepository({
    get: async (key) => options.storage.get(key),
    set: async (values) => options.storage.set(values),
  })
  return {
    service: new MigrationPreflightService({
      capacityPolicy: {
        minimumReserveBytes: MIGRATION_CAPACITY_MINIMUM_RESERVE_BYTES,
        reserveRatio: MIGRATION_CAPACITY_RESERVE_RATIO,
      },
      coordination: options.coordination,
      estimateStorage: options.estimateStorage,
      fingerprint: new Sha256MigrationSourceFingerprint(),
      now: options.now,
      rawReader,
      repository,
    }),
  }
}

const estimateBrowserStorage: PersistenceStorageEstimatePort = async () => {
  return globalThis.navigator.storage.estimate()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getDefaultStorage = (): MigrationPreflightStorage => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('chrome.storage.local is unavailable.')
  }
  return {
    get: async (keys) => {
      const result: unknown = await storage.get(keys)
      if (!isRecord(result)) {
        throw new Error('chrome.storage.local returned an invalid result.')
      }
      return result
    },
    set: async (values) => {
      await storage.set(values)
    },
  }
}

const createTestStorage = (): MigrationPreflightStorage => {
  const values: Record<string, unknown> = {}
  return {
    get: async (keys) => {
      const selected: readonly string[] =
        typeof keys === 'string' ? [keys] : keys
      await Promise.resolve()
      return Object.fromEntries(
        selected.flatMap((key) =>
          Object.hasOwn(values, key) ? [[key, values[key]]] : [],
        ),
      )
    },
    set: async (entries) => {
      Object.assign(values, entries)
      await Promise.resolve()
    },
  }
}

let runtime: MigrationPreflightRuntime | undefined

export const getMigrationPreflightRuntime = (): MigrationPreflightRuntime => {
  runtime ??= createMigrationPreflightRuntime(
    import.meta.env.MODE === 'test'
      ? {
          coordination: getPersistenceBootstrapRuntime().coordination,
          estimateStorage: async () => {
            await Promise.resolve()
            return { quota: 10_000_000, usage: 0 }
          },
          now: () => Date.now(),
          storage: createTestStorage(),
        }
      : {
          coordination: getPersistenceBootstrapRuntime().coordination,
          estimateStorage: estimateBrowserStorage,
          now: () => Date.now(),
          storage: getDefaultStorage(),
        },
  )
  return runtime
}

export const resetMigrationPreflightRuntimeForTesting = (): void => {
  runtime = undefined
}

import { describe, expect, it, vi } from 'vitest'

import type { PersistenceControlStateRepositoryPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2VerifiedMigrationTargetPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS } from '@/contexts/saved-tabs/application/services/LegacyStorageCleanupService'
import { LEGACY_STORAGE_CLEANUP_METADATA_KEY } from '@/contexts/saved-tabs/infrastructure/persistence/cleanup/ChromeLegacyStorageCleanupRepository'
import type { LegacyStorageCleanupStorageArea } from '@/contexts/saved-tabs/infrastructure/persistence/cleanup/ChromeLegacyStorageCleanupRepository'

import { createLegacyStorageCleanupRuntime } from './legacyStorageCleanupRuntime'

const MIGRATION_ID = 'persistence-v2-production'

const emptySnapshot: PersistenceLogicalSnapshot = {
  analyticsViews: [],
  conversations: [],
  messages: [],
  revision: 1,
  savedTabs: {
    categories: [],
    collections: [],
    groups: [],
    memberships: [],
    urls: [],
  },
}

const createStorage = (state: Record<string, unknown>) =>
  ({
    get: vi.fn(async (keys: string | readonly string[]) => {
      const selected = typeof keys === 'string' ? [keys] : keys
      return Object.fromEntries(
        selected.flatMap((key) =>
          Object.hasOwn(state, key) ? [[key, state[key]]] : [],
        ),
      )
    }),
    remove: vi.fn(async (keys: readonly string[]) => {
      for (const key of keys) {
        delete state[key]
      }
    }),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(state, values)
    }),
  }) satisfies LegacyStorageCleanupStorageArea

describe('legacyStorageCleanupRuntime', () => {
  it('wires per-user retention to verified target checks and bounded raw storage cleanup', async () => {
    let now = 1_000
    const state: Record<string, unknown> = {
      savedTabs: { legacy: true },
      seenVersion: '2.0.9',
      urls: [{ legacy: true }],
      userSettings: { openOnStartup: true },
    }
    const storage = createStorage(state)
    const controlStateRepository: PersistenceControlStateRepositoryPort = {
      read: vi.fn(async () => ({
        migrationId: MIGRATION_ID,
        persistenceGeneration: 2 as const,
        status: 'indexeddb' as const,
      })),
      transition: vi.fn(),
    }
    const target: PersistenceV2VerifiedMigrationTargetPort = {
      readVerifiedSnapshot: vi.fn(async () => emptySnapshot),
    }
    const runtime = createLegacyStorageCleanupRuntime({
      clock: { now: () => now },
      controlStateRepository,
      coordination: {
        runExclusive: async (operation) => operation(),
        runShared: async (operation) => operation(),
      },
      storage,
      target,
    })

    await expect(runtime.service.run()).resolves.toBe('retained')
    expect(state[LEGACY_STORAGE_CLEANUP_METADATA_KEY]).toMatchObject({
      migrationId: MIGRATION_ID,
      retentionStartedAt: now,
      status: 'retained',
    })
    expect(state.urls).toBeDefined()

    now += LEGACY_STORAGE_CLEANUP_GRACE_PERIOD_MS
    await expect(runtime.service.run()).resolves.toBe('completed')

    expect(target.readVerifiedSnapshot).toHaveBeenCalledTimes(2)
    expect(state).not.toHaveProperty('savedTabs')
    expect(state).not.toHaveProperty('urls')
    expect(state).toMatchObject({
      seenVersion: '2.0.9',
      userSettings: { openOnStartup: true },
    })
    expect(state[LEGACY_STORAGE_CLEANUP_METADATA_KEY]).toMatchObject({
      migrationId: MIGRATION_ID,
      status: 'completed',
    })
  })
})

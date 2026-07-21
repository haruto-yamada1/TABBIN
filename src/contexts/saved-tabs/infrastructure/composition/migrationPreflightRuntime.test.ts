import { describe, expect, it, vi } from 'vitest'

import type { PersistenceCoordinationPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import { MIGRATION_PREFLIGHT_STORAGE_KEY } from '@/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromeMigrationPreflightRepository'

import { createMigrationPreflightRuntime } from './migrationPreflightRuntime'

describe('migrationPreflightRuntime', () => {
  it('composes raw reads and control-record writes behind the supplied barrier', async () => {
    const values = Object.fromEntries(
      MIGRATION_SOURCE_KEYS.map((key) => [
        key,
        key === 'activeAiChatConversationId' ? '' : [],
      ]),
    )
    const storage = {
      get: vi.fn(async (keys: string | readonly string[]) => {
        const selected = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(
          selected.flatMap((key) =>
            Object.hasOwn(values, key) ? [[key, values[key]]] : [],
          ),
        )
      }),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        Object.assign(values, entries)
      }),
    }
    const coordination: PersistenceCoordinationPort = {
      runExclusive: vi.fn(async (operation) => operation()),
      runShared: vi.fn(async (operation) => operation()),
    }
    const runtime = createMigrationPreflightRuntime({
      coordination,
      estimateStorage: vi.fn(async () => ({ quota: 10_000_000, usage: 0 })),
      now: () => 123,
      storage,
    })

    const status = await runtime.service.run()

    expect(status.status).toBe('healthy')
    expect(storage.get).toHaveBeenCalledWith([...MIGRATION_SOURCE_KEYS])
    expect(storage.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [MIGRATION_PREFLIGHT_STORAGE_KEY]: expect.objectContaining({
          status: 'healthy',
        }),
      }),
    )
    expect(coordination.runExclusive).toHaveBeenCalled()
  })
})

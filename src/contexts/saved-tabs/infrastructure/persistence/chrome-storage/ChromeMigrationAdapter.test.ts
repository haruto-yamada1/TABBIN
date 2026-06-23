import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrationFns = vi.hoisted(() => ({
  migrateParentCategoriesToDomainNames: vi.fn(),
  migrateToUrlsStorage: vi.fn(),
}))

vi.mock('@/lib/storage/migration', () => ({
  migrateParentCategoriesToDomainNames:
    migrationFns.migrateParentCategoriesToDomainNames,
  migrateToUrlsStorage: migrationFns.migrateToUrlsStorage,
}))

import { createChromeMigrationAdapter } from './ChromeMigrationAdapter'

describe('createChromeMigrationAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    migrationFns.migrateParentCategoriesToDomainNames.mockResolvedValue(
      undefined,
    )
    migrationFns.migrateToUrlsStorage.mockResolvedValue(undefined)
  })

  it('parent category domainNames migration を lib/storage に委譲する', async () => {
    const adapter = createChromeMigrationAdapter()

    await adapter.migrateParentCategoriesToDomainNames()

    expect(
      migrationFns.migrateParentCategoriesToDomainNames,
    ).toHaveBeenCalledTimes(1)
  })

  it('urls storage migration を lib/storage に委譲する', async () => {
    const adapter = createChromeMigrationAdapter()

    await adapter.migrateToUrlsStorage()

    expect(migrationFns.migrateToUrlsStorage).toHaveBeenCalledTimes(1)
  })
})

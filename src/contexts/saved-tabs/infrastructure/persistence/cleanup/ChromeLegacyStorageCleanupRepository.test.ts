import { describe, expect, it, vi } from 'vitest'

import { LegacyStorageCleanupError } from '@/contexts/saved-tabs/application/ports/LegacyStorageCleanupPort'

import {
  ChromeLegacyStorageCleanupRepository,
  LEGACY_DOMAIN_STORAGE_KEYS,
  LEGACY_STORAGE_CLEANUP_METADATA_KEY,
} from './ChromeLegacyStorageCleanupRepository'
import type { LegacyStorageCleanupStorageArea } from './ChromeLegacyStorageCleanupRepository'

type StorageFixture = {
  readonly area: LegacyStorageCleanupStorageArea
  readonly remove: ReturnType<typeof vi.fn>
  readonly state: Record<string, unknown>
}

const createStorage = (
  initialState: Record<string, unknown> = {},
): StorageFixture => {
  const state = { ...initialState }
  const get = vi.fn(async (keys: string | readonly string[]) => {
    const selected = typeof keys === 'string' ? [keys] : keys
    return Object.fromEntries(
      selected
        .filter((key) => Object.hasOwn(state, key))
        .map((key) => [key, state[key]]),
    )
  })
  const remove = vi.fn(async (keys: readonly string[]) => {
    for (const key of keys) {
      delete state[key]
    }
  })
  const set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(state, values)
  })
  return { area: { get, remove, set }, remove, state }
}

const expectCleanupErrorCode = async (
  operation: Promise<unknown>,
  code: LegacyStorageCleanupError['code'],
): Promise<void> => {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(LegacyStorageCleanupError)
    expect((error as LegacyStorageCleanupError).code).toBe(code)
    return
  }
  throw new Error('Expected legacy storage cleanup to fail.')
}

describe('ChromeLegacyStorageCleanupRepository', () => {
  it('uses an explicit audited allowlist for migrated domain data only', () => {
    expect(LEGACY_DOMAIN_STORAGE_KEYS).toStrictEqual([
      'urls',
      'savedTabs',
      'customProjects',
      'customProjectOrder',
      'parentCategories',
      'domainCategorySettings',
      'domainCategoryMappings',
      'aiChatConversations',
      'savedAnalyticsViews',
      'urlsMigrationCompleted',
      'domainHostnameMigrationCompleted',
    ])
  })

  it('removes only allowlisted keys and preserves settings, notices, and control-plane data', async () => {
    const preserved = {
      activeAiChatConversationId: 'conversation-2',
      changelogShown: true,
      seenVersion: '2.0.9',
      'tab-manager-theme': 'dark',
      'tabbin:migrationPreflight:v1': { status: 'healthy' },
      'tabbin:noticeDismissals:v1': { migration: true },
      'tabbin:persistenceControlState:v2': { status: 'indexeddb' },
      userSettings: { openOnStartup: true },
    }
    const legacy = Object.fromEntries(
      LEGACY_DOMAIN_STORAGE_KEYS.map((key) => [key, { legacy: key }]),
    )
    const storage = createStorage({ ...legacy, ...preserved })
    const repository = new ChromeLegacyStorageCleanupRepository(storage.area)

    await repository.removeLegacyDomainData()

    expect(storage.remove).toHaveBeenCalledWith(LEGACY_DOMAIN_STORAGE_KEYS)
    await expect(repository.readRemainingLegacyKeys()).resolves.toEqual([])
    expect(storage.state).toStrictEqual(preserved)
  })

  it('treats a present undefined value as a remaining legacy key', async () => {
    const storage = createStorage({ urls: undefined })
    const repository = new ChromeLegacyStorageCleanupRepository(storage.area)

    await expect(repository.readRemainingLegacyKeys()).resolves.toEqual([
      'urls',
    ])
  })

  it('round-trips one bounded metadata record without deleting it', async () => {
    const storage = createStorage()
    const repository = new ChromeLegacyStorageCleanupRepository(storage.area)
    const metadata = {
      migrationId: 'persistence-v2-production',
      retentionStartedAt: 1,
      status: 'retained',
      version: 1,
    } as const

    await expect(repository.readMetadata()).resolves.toBeUndefined()
    await repository.saveMetadata(metadata)

    await expect(repository.readMetadata()).resolves.toStrictEqual(metadata)
    expect(storage.state[LEGACY_STORAGE_CLEANUP_METADATA_KEY]).toStrictEqual(
      metadata,
    )
    await repository.removeLegacyDomainData()
    expect(storage.state[LEGACY_STORAGE_CLEANUP_METADATA_KEY]).toStrictEqual(
      metadata,
    )
  })

  it('rejects malformed metadata instead of resetting the retention clock', async () => {
    expect.hasAssertions()
    const storage = createStorage({
      [LEGACY_STORAGE_CLEANUP_METADATA_KEY]: {
        migrationId: '',
        retentionStartedAt: -1,
        status: 'retained',
        version: 1,
      },
    })
    const repository = new ChromeLegacyStorageCleanupRepository(storage.area)

    await expectCleanupErrorCode(
      repository.readMetadata(),
      'LEGACY_STORAGE_CLEANUP_METADATA_INVALID',
    )
  })

  it.each(['get', 'remove', 'set'] as const)(
    'classifies %s failures as storage unavailable',
    async (method) => {
      expect.hasAssertions()
      const storage = createStorage()
      vi.mocked(storage.area[method]).mockRejectedValueOnce(
        new Error(`${method} failed`),
      )
      const repository = new ChromeLegacyStorageCleanupRepository(storage.area)
      let operation: Promise<unknown>
      if (method === 'get') {
        operation = repository.readMetadata()
      } else if (method === 'remove') {
        operation = repository.removeLegacyDomainData()
      } else {
        operation = repository.saveMetadata({
          migrationId: 'persistence-v2-production',
          retentionStartedAt: 1,
          status: 'retained',
          version: 1,
        })
      }

      await expectCleanupErrorCode(
        operation,
        'LEGACY_STORAGE_CLEANUP_STORAGE_UNAVAILABLE',
      )
    },
  )
})

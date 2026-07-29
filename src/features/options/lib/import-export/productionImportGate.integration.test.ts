// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage/migration', () => ({
  migrateToUrlsStorage: vi.fn(),
}))

import { migrateToUrlsStorage } from '@/lib/storage/migration'

vi.mock('./currentImportDate', () => ({
  getCurrentUtcDateOnly: vi.fn(),
}))

import { getCurrentUtcDateOnly } from './currentImportDate'
import { importSettings } from './flows'

const currentV2 = {
  appVersion: '2.0.8',
  data: {
    analyticsViews: [],
    conversations: [],
    messages: [],
    savedTabs: {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    },
    userSettings: {
      clickBehavior: 'saveSameDomainTabs',
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: [],
      excludePinnedTabs: true,
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: false,
      showSavedTime: false,
    },
  },
  exportedAt: '2026-07-28T00:00:00.000Z',
  schemaVersion: 2,
}

const futureV2 = {
  appVersion: '3.0.0',
  data: {},
  exportedAt: '2027-01-01T00:00:00.000Z',
  schemaVersion: 3,
}

const legacyBackup = {
  parentCategories: [],
  savedTabs: [],
  timestamp: '2026-07-28T00:00:00.000Z',
  userSettings: {},
  version: '1.0.0',
}

describe('importSettings production pre-mutation gate', () => {
  const get = vi.fn()
  const set = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(migrateToUrlsStorage).mockResolvedValue(undefined)
    vi.mocked(getCurrentUtcDateOnly).mockReturnValue('2026-08-31')
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: { get, set },
        },
      },
    })
  })

  it.each([
    ['current V2', currentV2, '2026-07-28'],
    ['future V2', futureV2, '2026-07-28'],
    ['expired legacy', legacyBackup, '2026-09-01'],
  ])(
    'rejects %s before migration or storage access',
    async (_label, backup, importDate) => {
      const result = await importSettings(
        JSON.stringify(backup),
        true,
        undefined,
        { importDate },
      )

      expect(result.success).toBe(false)
      expect(migrateToUrlsStorage).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
      expect(set).not.toHaveBeenCalled()
    },
  )

  it('enforces the provider date for a non-UI legacy caller', async () => {
    vi.mocked(getCurrentUtcDateOnly).mockReturnValue('2026-09-01')

    const result = await importSettings(JSON.stringify(legacyBackup))

    expect(result.success).toBe(false)
    expect(getCurrentUtcDateOnly).toHaveBeenCalledOnce()
    expect(migrateToUrlsStorage).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('blocks a valid legacy overwrite before migration or storage access', async () => {
    const result = await importSettings(JSON.stringify(legacyBackup), false)

    expect(result.success).toBe(false)
    expect(migrateToUrlsStorage).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects malformed legacy-shaped input before every mutation route', async () => {
    const result = await importSettings(
      JSON.stringify({
        ...legacyBackup,
        privatePayload: 'secret',
      }),
      true,
    )

    expect(result.success).toBe(false)
    expect(migrateToUrlsStorage).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })
})

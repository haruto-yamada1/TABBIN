// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  importBackupV2WithRecovery: vi.fn(),
}))

vi.mock('@/lib/storage/migration', () => ({
  migrateToUrlsStorage: vi.fn(),
}))

import { importBackupV2WithRecovery } from '@/app/composition/optionsBackupRecovery'
import { migrateToUrlsStorage } from '@/lib/storage/migration'

vi.mock('./currentImportDate', () => ({
  getCurrentUtcDateOnly: vi.fn(),
}))

import { getCurrentUtcDateOnly } from './currentImportDate'
import { getImportPreview, importSettings } from './flows'

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
    vi.mocked(importBackupV2WithRecovery).mockResolvedValue({
      entityCounts: {
        analyticsViews: 0,
        categories: 0,
        collections: 0,
        conversations: 0,
        groups: 0,
        memberships: 0,
        messages: 0,
        urls: 0,
      },
      revision: 2,
    })
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

  it.each([
    ['current V2', currentV2],
    ['legacy', legacyBackup],
  ])(
    'routes a valid %s overwrite through recovery before legacy mutation paths',
    async (_label, backup) => {
      const result = await importSettings(JSON.stringify(backup), false)

      expect(result.success).toBe(true)
      expect(importBackupV2WithRecovery).toHaveBeenCalledOnce()
      expect(migrateToUrlsStorage).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
      expect(set).not.toHaveBeenCalled()
    },
  )

  it('returns a strict V2 preview before the overwrite confirmation', () => {
    const result = getImportPreview(JSON.stringify(currentV2))

    expect(result).toEqual({
      success: true,
      message: 'データの解析に成功しました',
      preview: {
        categoriesCount: 0,
        domainsCount: 0,
        hasAiChat: false,
        hasAnalytics: false,
        projectsCount: 0,
        timestamp: '2026-07-28T00:00:00.000Z',
        version: '2.0.8',
      },
    })
  })

  it('blocks an overwrite when recovery capture fails', async () => {
    vi.mocked(importBackupV2WithRecovery).mockRejectedValueOnce(
      new Error('RECOVERY_CAPTURE_FAILED'),
    )

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

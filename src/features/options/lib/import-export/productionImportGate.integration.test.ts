// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  importBackupV2WithRecovery: vi.fn(),
}))

import { importBackupV2WithRecovery } from '@/app/composition/optionsBackupRecovery'

import { getImportPreview, importSettings } from './flows'

const currentV2 = {
  appVersion: '2.0.16',
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
  exportedAt: '2026-09-01T00:00:00.000Z',
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

describe('current Backup V2 production import boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('imports current Backup V2 through recovery-backed overwrite', async () => {
    await expect(
      importSettings(JSON.stringify(currentV2)),
    ).resolves.toMatchObject({ success: true })
    expect(importBackupV2WithRecovery).toHaveBeenCalledOnce()
  })

  it.each([
    ['legacy', legacyBackup, 'UNSUPPORTED_LEGACY_BACKUP'],
    ['future', futureV2, 'UNSUPPORTED_FUTURE_SCHEMA'],
  ])(
    'rejects %s input before persistence mutation',
    async (_label, input, code) => {
      const result = await importSettings(JSON.stringify(input))

      expect(result).toMatchObject({
        diagnostic: { errorCode: code, stage: 'format-detection' },
        success: false,
      })
      expect(importBackupV2WithRecovery).not.toHaveBeenCalled()
    },
  )

  it('classifies malformed JSON separately from legacy input', async () => {
    await expect(importSettings('{malformed-json')).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'INVALID_BACKUP',
        stage: 'format-detection',
      },
      success: false,
    })
    expect(importBackupV2WithRecovery).not.toHaveBeenCalled()
  })

  it('returns a strict current V2 preview', () => {
    expect(getImportPreview(JSON.stringify(currentV2))).toEqual({
      success: true,
      message: 'データの解析に成功しました',
      preview: {
        categoriesCount: 0,
        domainsCount: 0,
        hasAiChat: false,
        hasAnalytics: false,
        projectsCount: 0,
        timestamp: '2026-09-01T00:00:00.000Z',
        version: '2.0.16',
      },
    })
  })

  it('does not expose a legacy backup as an importable preview', () => {
    expect(getImportPreview(JSON.stringify(legacyBackup))).toMatchObject({
      diagnostic: { errorCode: 'UNSUPPORTED_LEGACY_BACKUP' },
      success: false,
    })
  })

  it('reports recovery failure as a write-stage failure', async () => {
    vi.mocked(importBackupV2WithRecovery).mockRejectedValueOnce(
      new Error('RECOVERY_CAPTURE_FAILED'),
    )

    await expect(
      importSettings(JSON.stringify(currentV2)),
    ).resolves.toMatchObject({
      diagnostic: {
        errorCode: 'UNKNOWN_IMPORT_ERROR',
        stage: 'v2-overwrite',
      },
      success: false,
    })
  })
})

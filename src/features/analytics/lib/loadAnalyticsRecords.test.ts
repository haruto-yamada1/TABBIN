import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  getUserSettings: vi.fn<() => Promise<{ excludePatterns?: string[] }>>(
    async () => ({ excludePatterns: [] }),
  ),
  readAnalyticsRecords: vi.fn(async () => [
    {
      domain: 'allowed.example',
      eventId: 'url-1:first-saved',
      id: 'url-1',
      metric: 'first-saved' as const,
      parentCategories: [],
      projectCategories: [],
      savedAt: 1,
      savedInProjects: [],
      savedInTabGroups: ['allowed.example'],
      subCategories: [],
      title: 'Allowed',
      timestampAccuracy: 'exact' as const,
      url: 'https://allowed.example/',
    },
  ]),
}))

vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    readAnalyticsRecords: mocked.readAnalyticsRecords,
  }),
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: mocked.getUserSettings,
}))

import { loadAnalyticsRecords } from './loadAnalyticsRecords'

describe('loadAnalyticsRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selected persistence routeから分析レコードを読む', async () => {
    await expect(loadAnalyticsRecords()).resolves.toEqual([
      expect.objectContaining({ id: 'url-1' }),
    ])
    expect(mocked.readAnalyticsRecords).toHaveBeenCalledOnce()
  })

  it('excludePatterns に一致するURLを分析対象から除外する', async () => {
    mocked.getUserSettings.mockResolvedValueOnce({
      excludePatterns: ['allowed.example'],
    })

    await expect(loadAnalyticsRecords()).resolves.toEqual([])
  })

  it('excludePatterns が未定義でも空配列に正規化する', async () => {
    mocked.getUserSettings.mockResolvedValueOnce({
      excludePatterns: undefined,
    })

    await expect(loadAnalyticsRecords()).resolves.toHaveLength(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

import { loadAnalyticsRecords } from './loadAnalyticsRecords'

const mocks = vi.hoisted(() => ({
  buildAiSavedUrlRecords: vi.fn(() => [{ id: 'record-1' }]),

  getCustomProjects: vi.fn(async () => [{ id: 'project-1' }]),

  getParentCategories: vi.fn(async () => [{ id: 'category-1' }]),
  getUserSettings: vi.fn<() => Promise<Pick<UserSettings, 'excludePatterns'>>>(
    async () => ({
      excludePatterns: [],
    }),
  ),

  getUrlRecords: vi.fn(async () => [
    {
      id: 'url-1',
      savedAt: 1,
      title: 'Allowed',
      url: 'https://allowed.example',
    },
  ]),
}))

vi.mock('@/features/ai-chat/lib/buildAiContext', () => ({
  buildAiSavedUrlRecords: mocks.buildAiSavedUrlRecords,
}))

vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: mocks.getParentCategories,
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: mocks.getUserSettings,
}))

vi.mock('@/lib/storage/projects', () => ({
  getCustomProjects: mocks.getCustomProjects,
}))

vi.mock('@/lib/storage/urls', () => ({
  getUrlRecords: mocks.getUrlRecords,
}))

vi.mock('@/lib/storage/tabs', () => ({
  getSavedTabs: vi.fn(async () => {
    const result = await chrome.storage.local.get('savedTabs')
    return Array.isArray(result.savedTabs) ? result.savedTabs : []
  }),
}))

describe('loadAnalyticsRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            savedTabs: [{ id: 'group-1' }],
          })),
        },
      },
    } as unknown as typeof chrome
  })

  it('保存ストレージから分析レコードを組み立てる', async () => {
    await expect(loadAnalyticsRecords()).resolves.toStrictEqual([
      { id: 'record-1' },
    ])

    expect(mocks.buildAiSavedUrlRecords).toHaveBeenCalledWith({
      customProjects: [{ id: 'project-1' }],
      parentCategories: [{ id: 'category-1' }],
      savedTabs: [{ id: 'group-1' }],
      urlRecords: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Allowed',
          url: 'https://allowed.example',
        },
      ],
    })
  })

  it('excludePatterns に一致するURLと不正URLを分析対象から除外する', async () => {
    mocks.getUserSettings.mockResolvedValueOnce({
      excludePatterns: ['blocked.example'],
    })
    mocks.getUrlRecords.mockResolvedValueOnce([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Allowed',
        url: 'https://allowed.example',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Blocked',
        url: 'https://blocked.example',
      },
      {
        id: 'url-3',
        savedAt: 3,
        title: 'Invalid',
        url: 'not-a-valid-url',
      },
    ])

    await loadAnalyticsRecords()

    expect(mocks.buildAiSavedUrlRecords).toHaveBeenCalledWith({
      customProjects: [{ id: 'project-1' }],
      parentCategories: [{ id: 'category-1' }],
      savedTabs: [{ id: 'group-1' }],
      urlRecords: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Allowed',
          url: 'https://allowed.example',
        },
      ],
    })
  })

  it('savedTabs が配列でなく excludePatterns が未定義でも空配列に正規化する', async () => {
    const storageGet = vi.mocked(chrome.storage.local.get) as unknown as {
      mockResolvedValueOnce: (value: unknown) => void
    }
    storageGet.mockResolvedValueOnce({
      savedTabs: 'invalid',
    })
    mocks.getUserSettings.mockResolvedValueOnce({
      excludePatterns: undefined as unknown as string[],
    })

    await loadAnalyticsRecords()

    expect(mocks.buildAiSavedUrlRecords).toHaveBeenCalledWith({
      customProjects: [{ id: 'project-1' }],
      parentCategories: [{ id: 'category-1' }],
      savedTabs: [],
      urlRecords: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Allowed',
          url: 'https://allowed.example',
        },
      ],
    })
  })
})

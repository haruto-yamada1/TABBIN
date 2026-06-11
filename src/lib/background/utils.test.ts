import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: vi.fn(),
}))

vi.mock('./alarm-notification', () => ({
  showNotification: vi.fn(),
}))

import { getUserSettings } from '@/lib/storage/settings'

import { filterTabsByUserSettings } from './utils'

const buildSettings = (override: Partial<UserSettings> = {}): UserSettings => ({
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: ['about:', 'chrome://', 'chrome-extension://'],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
  ...override,
})

const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: partial.id ?? 1,
    pinned: partial.pinned ?? false,
    url: partial.url,
    title: partial.title ?? 'tab',
  }) as chrome.tabs.Tab

describe('filterTabsByUserSettings関数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('ピン留めタブ・URL のないタブ・除外パターン一致を除外する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      buildSettings({
        excludePinnedTabs: true,
        excludePatterns: ['blocked.example', 'chrome://'],
      }),
    )

    const tabs = [
      tab({ id: 1, pinned: true, url: 'https://keep.example/pinned' }),
      tab({ id: 2, pinned: false, url: 'chrome://settings' }),
      tab({ id: 3, pinned: false, url: undefined }),
      tab({ id: 4, pinned: false, url: 'https://blocked.example/page' }),
      tab({ id: 5, pinned: false, url: 'https://allowed.example/page' }),
    ]

    const result = await filterTabsByUserSettings(tabs)

    expect(result).toStrictEqual([tabs[4]])
    expect(console.log).toHaveBeenCalledWith(
      '固定タブを 1 個除外しました (5 → 4)',
    )
  })

  it('ピン留め除外が無効な場合はピン留めタブを保持する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      buildSettings({
        excludePinnedTabs: false,
        excludePatterns: ['chrome://'],
      }),
    )

    const pinnedTab = tab({
      id: 10,
      pinned: true,
      url: 'https://allowed.example/pinned',
    })
    const normalTab = tab({
      id: 11,
      pinned: false,
      url: 'https://allowed.example/normal',
    })

    const result = await filterTabsByUserSettings([pinnedTab, normalTab])

    expect(result).toStrictEqual([pinnedTab, normalTab])
  })

  it('除外パターン未設定なら about:blank も保持し、不正URLだけ除外する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      buildSettings({
        excludePinnedTabs: false,
        excludePatterns: [],
      }),
    )

    const aboutTab = tab({
      id: 14,
      pinned: false,
      url: 'about:blank',
    })
    const invalidTab = tab({
      id: 15,
      pinned: false,
      url: 'not-a-valid-url',
    })
    const httpsTab = tab({
      id: 16,
      pinned: false,
      url: 'https://allowed.example/path',
    })

    const result = await filterTabsByUserSettings([
      aboutTab,
      invalidTab,
      httpsTab,
    ])

    expect(result).toStrictEqual([aboutTab, httpsTab])
  })

  it('excludePatterns に about: がある場合は about:blank を除外する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      buildSettings({
        excludePinnedTabs: false,
        excludePatterns: ['about:'],
      }),
    )

    const aboutTab = tab({
      id: 17,
      pinned: false,
      url: 'about:blank',
    })
    const httpsTab = tab({
      id: 18,
      pinned: false,
      url: 'https://allowed.example/path',
    })

    const result = await filterTabsByUserSettings([aboutTab, httpsTab])

    expect(result).toStrictEqual([httpsTab])
  })

  it('ピン留めタブが除外されなかった場合はその除外ログを出力しない', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      buildSettings({
        excludePinnedTabs: true,
        excludePatterns: [],
      }),
    )

    const tabs = [
      tab({ id: 12, pinned: false, url: 'https://allowed.example/1' }),
      tab({ id: 13, pinned: false, url: 'https://allowed.example/2' }),
    ]

    const result = await filterTabsByUserSettings(tabs)

    expect(result).toStrictEqual(tabs)
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('固定タブを'),
    )
  })

  it('設定取得に失敗した場合は元のタブ配列を返す', async () => {
    const error = new Error('settings failed')
    vi.mocked(getUserSettings).mockRejectedValue(error)

    const tabs = [tab({ id: 20, url: 'https://allowed.example' })]
    const result = await filterTabsByUserSettings(tabs)

    expect(result).toBe(tabs)
    expect(console.error).toHaveBeenCalledWith(
      'タブフィルタリングエラー:',
      error,
    )
  })
})

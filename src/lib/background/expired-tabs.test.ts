import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TabGroup } from '@/types/storage'

import {
  checkAndRemoveExpiredTabs,
  getExpirationPeriodMs,
  isAutoDeletePeriod,
  updateTabTimestamps,
} from './expired-tabs'

interface Store {
  userSettings?: {
    autoDeletePeriod?: string
  }
  savedTabs?: TabGroup[]
}
const createChromeStorageMock = (initialStore: Store = {}) => {
  const store: Store = structuredClone(initialStore)
  const get = vi.fn(
    async (keys?: string | string[] | Record<string, unknown>) => {
      if (keys == null) {
        return structuredClone(store)
      }
      if (typeof keys === 'string') {
        return {
          [keys]: structuredClone(store[keys as keyof Store]),
        }
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          result[key] = structuredClone(store[key as keyof Store])
        }
        return result
      }
      const result: Record<string, unknown> = {}
      for (const [key, fallback] of Object.entries(keys)) {
        const value = store[key as keyof Store]
        result[key] = value === undefined ? structuredClone(fallback) : value
      }
      return result
    },
  )
  const set = vi.fn(async (next: Partial<Store>) => {
    Object.assign(store, structuredClone(next))
  })
  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = {
    storage: {
      local: {
        get,
        set,
      },
    },
  } as unknown as typeof chrome
  return {
    store,
    get,
    set,
  }
}
describe('expired-tabs ユーティリティ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useRealTimers()
  })
  it('有効な自動削除期間を判定する', () => {
    expect(isAutoDeletePeriod('never')).toBe(true)
    expect(isAutoDeletePeriod('30sec')).toBe(true)
    expect(isAutoDeletePeriod('365days')).toBe(true)
    expect(isAutoDeletePeriod('invalid')).toBe(false)
  })
  it('自動削除期間をミリ秒に変換する', () => {
    expect(getExpirationPeriodMs('30sec')).toBe(30000)
    expect(getExpirationPeriodMs('1min')).toBe(60000)
    expect(getExpirationPeriodMs('1hour')).toBe(3600000)
    expect(getExpirationPeriodMs('1day')).toBe(86400000)
    expect(getExpirationPeriodMs('7days')).toBe(7 * 86400000)
    expect(getExpirationPeriodMs('14days')).toBe(14 * 86400000)
    expect(getExpirationPeriodMs('30days')).toBe(30 * 86400000)
    expect(getExpirationPeriodMs('180days')).toBe(180 * 86400000)
    expect(getExpirationPeriodMs('365days')).toBe(365 * 86400000)
    expect(getExpirationPeriodMs('never')).toBeNull()
  })
  describe('checkAndRemoveExpiredTabs関数', () => {
    it('自動削除が無効な場合は削除をスキップする', async () => {
      const { get, set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: 'never',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [
              {
                url: 'x',
                title: 'x',
              },
            ],
          },
        ],
      })
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(get).toHaveBeenCalledWith(['userSettings'])
      expect(get).not.toHaveBeenCalledWith('savedTabs')
      expect(set).not.toHaveBeenCalled()
    })
    it('userSettings/autoDeletePeriod がない場合は never にフォールバックする', async () => {
      const { set } = createChromeStorageMock({})
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(set).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('使用する自動削除期間:', 'never')
    })
    it('自動削除期間が不正な場合は削除をスキップする', async () => {
      const { set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: 'not-a-period',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [],
          },
        ],
      })
      await checkAndRemoveExpiredTabs()
      expect(set).not.toHaveBeenCalled()
    })
    it('期限切れ URL を削除し空グループを除去する', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000
      const { store, set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: '1day',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: now - oneDay * 3,
            urls: [
              {
                url: 'https://example.com/old',
                title: 'Old',
                savedAt: now - oneDay * 2,
              },
              {
                url: 'https://example.com/new',
                title: 'New',
                savedAt: now - oneDay / 2,
              },
            ],
          },
          {
            id: 'group-2',
            domain: 'remove-me.com',
            savedAt: now - oneDay * 5,
            urls: [
              {
                url: 'https://remove-me.com/expired',
                title: 'Expired',
              },
            ],
          },
        ],
      })
      await checkAndRemoveExpiredTabs()
      expect(set).toHaveBeenCalledTimes(1)
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: now - oneDay * 3,
            urls: [
              {
                url: 'https://example.com/new',
                title: 'New',
                savedAt: now - oneDay / 2,
              },
            ],
          },
        ],
      })
      expect(store.savedTabs).toHaveLength(1)
      expect(store.savedTabs?.[0]?.urls).toHaveLength(1)
    })
    it('期限切れ URL がない場合は書き込まない', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const { set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: '1day',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [
              {
                url: 'https://example.com/fresh',
                title: 'Fresh',
                savedAt: now - 1000,
              },
            ],
          },
        ],
      })
      await checkAndRemoveExpiredTabs()
      expect(set).not.toHaveBeenCalled()
    })
    it('ストレージに保存タブがない場合は早期 return する', async () => {
      const { get, set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: '1day',
        },
        savedTabs: [],
      })
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(get).toHaveBeenCalledWith('savedTabs')
      expect(set).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('保存されたタブはありません')
    })
    it('savedTabs キーがない場合は空配列にフォールバックする', async () => {
      const { set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: '1day',
        },
      })
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(set).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('保存されたタブはありません')
    })
    it('urls のないグループやタイムスタンプのない url エントリを処理する', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const { set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: '1day',
        },
        savedTabs: [
          {
            id: 'group-no-urls',
            domain: 'no-urls.example',
          },
          {
            id: 'group-no-timestamps',
            domain: 'no-ts.example',
            urls: [
              {
                url: 'https://no-ts.example',
                title: 'No TS',
              },
            ],
          },
        ],
      })
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()

      // timestamp fallback resolves to currentTime, so nothing is expired.
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-no-timestamps',
            domain: 'no-ts.example',
            urls: [
              {
                url: 'https://no-ts.example',
                title: 'No TS',
              },
            ],
          },
        ],
      })
      expect(console.log).toHaveBeenCalledWith(
        `現在時刻: ${new Date(now).toLocaleString()}`,
      )
    })
    it('予期しないエラーを捕捉してログ出力する', async () => {
      const { get } = createChromeStorageMock()
      get.mockRejectedValueOnce(new Error('boom'))
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        '期限切れタブチェックエラー:',
        'boom',
      )
    })
    it('checkAndRemoveExpiredTabs の非 Error 例外値をログ出力する', async () => {
      const { get } = createChromeStorageMock()
      get.mockRejectedValueOnce('string boom')
      await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        '期限切れタブチェックエラー:',
        'string boom',
      )
    })
  })
  describe('updateTabTimestamps関数', () => {
    it('保存タブが存在しない場合は失敗を返す', async () => {
      createChromeStorageMock({
        savedTabs: [],
      })
      await expect(updateTabTimestamps('1day')).resolves.toStrictEqual({
        success: false,
        timestamp: 0,
      })
    })
    it('savedTabs キーがない場合は失敗を返す', async () => {
      createChromeStorageMock({})
      await expect(updateTabTimestamps('1day')).resolves.toStrictEqual({
        success: false,
        timestamp: 0,
      })
    })
    it('30sec 用のテストオフセットを使ってグループのタイムスタンプを更新する', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const { store, set } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: 'never',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: 1,
            urls: [],
          },
          {
            id: 'group-2',
            domain: 'other.com',
            savedAt: 2,
            urls: [],
          },
        ],
      })
      const result = await updateTabTimestamps('30sec')
      expect(result.success).toBe(true)
      expect(result.timestamp).toBe(now - 40000)
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: now - 40000,
            urls: [],
          },
          {
            id: 'group-2',
            domain: 'other.com',
            savedAt: now - 40000,
            urls: [],
          },
        ],
      })
      expect(
        store.savedTabs?.every((group) => group.savedAt === now - 40000),
      ).toBe(true)
    })
    it('1min 期間ではテストオフセットを使う', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const { store } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: 'never',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: 1,
            urls: [],
          },
        ],
      })
      const result = await updateTabTimestamps('1min')
      expect(result).toStrictEqual({
        success: true,
        timestamp: now - 70000,
      })
      expect(store.savedTabs?.[0]?.savedAt).toBe(now - 70000)
    })
    it('期間が省略された場合は現在時刻を使う', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
      const now = Date.now()
      const { store } = createChromeStorageMock({
        userSettings: {
          autoDeletePeriod: 'never',
        },
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            savedAt: 1,
            urls: [],
          },
        ],
      })
      const result = await updateTabTimestamps()
      expect(result).toStrictEqual({
        success: true,
        timestamp: now,
      })
      expect(store.savedTabs?.[0]?.savedAt).toBe(now)
    })
    it('ストレージエラーをログ出力後に再送出する', async () => {
      const { get } = createChromeStorageMock()
      const error = new Error('read failed')
      get.mockRejectedValueOnce(error)
      await expect(updateTabTimestamps('1day')).rejects.toThrow('read failed')
      expect(console.error).toHaveBeenCalledWith('タブ時刻更新エラー:', error)
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TabGroup } from '@/types/storage'

vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: vi.fn(),
  saveParentCategories: vi.fn(),
  updateDomainCategoryMapping: vi.fn(),
  updateDomainCategorySettings: vi.fn(),
}))

import {
  getParentCategories,
  saveParentCategories,
  updateDomainCategoryMapping,
  updateDomainCategorySettings,
} from '@/lib/storage/categories'

import { handleTabGroupRemoval, safelyUpdateGroupUrls } from './tab-operations'

interface LocalStore {
  savedTabs?: TabGroup[]
}
const createChromeMock = (initialStore: LocalStore = {}) => {
  const store: LocalStore = structuredClone(initialStore)
// eslint-disable-next-line typescript/require-await
  const get = vi.fn(async (key?: string) => {
    if (key == null) {
      return structuredClone(store)
    }
    return {
      [key]: structuredClone(store[key as keyof LocalStore]),
    }
  })
// eslint-disable-next-line typescript/require-await
  const set = vi.fn(async (next: Partial<LocalStore>) => {
    Object.assign(store, structuredClone(next))
  })
// eslint-disable-next-line typescript/require-await
  const sendMessage = vi.fn(async () => undefined)
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
    runtime: {
      sendMessage,
    },
  } as unknown as typeof chrome
  return {
    store,
    get,
    set,
    sendMessage,
  }
}
const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
describe('tab-operations ユーティリティ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  describe('handleTabGroupRemoval関数', () => {
    it('グループ削除前にカテゴリ設定と親マッピングを永続化する', async () => {
      createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            parentCategoryId: 'parent-1',
            subCategories: ['Docs'],
            categoryKeywords: [
              {
                categoryName: 'Docs',
                keywords: ['guide'],
              },
            ],
          },
        ],
      })
      vi.mocked(getParentCategories).mockResolvedValue([
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: [],
        },
        {
          id: 'parent-2',
          name: 'Private',
          domains: [],
          domainNames: ['another.com'],
        },
      ])
      await handleTabGroupRemoval('group-1')
      expect(updateDomainCategorySettings).toHaveBeenCalledWith(
        'example.com',
        ['Docs'],
        [
          {
            categoryName: 'Docs',
            keywords: ['guide'],
          },
        ],
      )
      expect(saveParentCategories).toHaveBeenCalledWith([
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: ['example.com'],
        },
        {
          id: 'parent-2',
          name: 'Private',
          domains: [],
          domainNames: ['another.com'],
        },
      ])
      expect(updateDomainCategoryMapping).toHaveBeenCalledWith(
        'example.com',
        'parent-1',
      )
    })
    it('ドメインが既に存在する場合は親カテゴリを書き換えない', async () => {
      createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            parentCategoryId: 'parent-1',
          },
        ],
      })
      vi.mocked(getParentCategories).mockResolvedValue([
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: ['example.com'],
        },
      ])
      await handleTabGroupRemoval('group-1')
      expect(updateDomainCategorySettings).toHaveBeenCalledWith(
        'example.com',
        [],
        [],
      )
      expect(saveParentCategories).not.toHaveBeenCalled()
      expect(updateDomainCategoryMapping).toHaveBeenCalledWith(
        'example.com',
        'parent-1',
      )
    })
    it('親カテゴリの domainNames が undefined の場合はドメイン名を追加する', async () => {
      createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            parentCategoryId: 'parent-1',
          },
        ],
      })
      vi.mocked(getParentCategories).mockResolvedValue([
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: undefined as unknown as string[],
        },
      ])
      await handleTabGroupRemoval('group-1')
      expect(saveParentCategories).toHaveBeenCalledWith([
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: ['example.com'],
        },
      ])
      expect(updateDomainCategoryMapping).toHaveBeenCalledWith(
        'example.com',
        'parent-1',
      )
    })
    it('parentCategoryId がない場合は親カテゴリの永続化とマッピングをスキップする', async () => {
      createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
          },
        ],
      })
      await handleTabGroupRemoval('group-1')
      expect(updateDomainCategorySettings).toHaveBeenCalledWith(
        'example.com',
        [],
        [],
      )
      expect(getParentCategories).not.toHaveBeenCalled()
      expect(saveParentCategories).not.toHaveBeenCalled()
      expect(updateDomainCategoryMapping).not.toHaveBeenCalled()
    })
    it('親カテゴリが見つからない場合は親カテゴリ書き換えをスキップしつつマッピングは更新する', async () => {
      createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            parentCategoryId: 'parent-missing',
          },
        ],
      })
      vi.mocked(getParentCategories).mockResolvedValue([
        {
          id: 'other-parent',
          name: 'Other',
          domains: [],
          domainNames: [],
        },
      ])
      await handleTabGroupRemoval('group-1')
      expect(saveParentCategories).not.toHaveBeenCalled()
      expect(updateDomainCategoryMapping).toHaveBeenCalledWith(
        'example.com',
        'parent-missing',
      )
    })
    it('グループが見つからない場合は何もしない', async () => {
      createChromeMock({
        savedTabs: [],
      })
      await expect(handleTabGroupRemoval('missing')).resolves.toBeUndefined()
      expect(updateDomainCategorySettings).not.toHaveBeenCalled()
      expect(getParentCategories).not.toHaveBeenCalled()
      expect(updateDomainCategoryMapping).not.toHaveBeenCalled()
    })
    it('エラーを握りつぶしてログ出力する', async () => {
      const { get } = createChromeMock()
      const error = new Error('storage read failed')
      get.mockRejectedValueOnce(error)
      await expect(handleTabGroupRemoval('group-1')).resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        'タブグループ削除前処理エラー:',
        error,
      )
    })
  })
  describe('safelyUpdateGroupUrls関数', () => {
    it('対象グループが存在しない場合は保存せずに return しつつコールバックは実行する', async () => {
      const { set, sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [],
          },
        ],
      })
      const callback = vi.fn()
      const resultPromise = safelyUpdateGroupUrls(
        'missing-group',
        [
          {
            url: 'https://x.test',
            title: 'X',
          },
        ],
        callback,
      )
      expect(callback).not.toHaveBeenCalled()
      await expect(resultPromise).resolves.toBeUndefined()
      await flushMicrotasks()
      expect(set).not.toHaveBeenCalled()
      expect(sendMessage).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledTimes(1)
    })
    it('対象グループが存在せずコールバック未指定の場合は保存せずに return する', async () => {
      const { set, sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [],
          },
        ],
      })
      await expect(
        safelyUpdateGroupUrls('missing-group', [
          {
            url: 'https://x.test',
            title: 'X',
          },
        ]),
      ).resolves.toBeUndefined()
      await flushMicrotasks()
      expect(set).not.toHaveBeenCalled()
      expect(sendMessage).not.toHaveBeenCalled()
    })
    it('グループの URLs を更新し、空になったら通知する', async () => {
      const { store, set, sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [
              {
                url: 'https://example.com/a',
                title: 'A',
              },
            ],
          },
          {
            id: 'group-2',
            domain: 'other.com',
            urls: [
              {
                url: 'https://other.com',
                title: 'B',
              },
            ],
          },
        ],
      })
      sendMessage.mockReturnValueOnce(Promise.reject(new Error('inactive')))
      const callback = vi.fn()
      await expect(
        safelyUpdateGroupUrls('group-1', [], callback),
      ).resolves.toBeUndefined()
      await flushMicrotasks()
      expect(set).toHaveBeenCalledTimes(1)
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [],
          },
          {
            id: 'group-2',
            domain: 'other.com',
            urls: [
              {
                url: 'https://other.com',
                title: 'B',
              },
            ],
          },
        ],
      })
      expect(store.savedTabs?.[0]?.urls).toStrictEqual([])
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'groupEmptied',
        groupId: 'group-1',
      })
      expect(callback).toHaveBeenCalledTimes(1)
    })
    it('グループが空になった際の同期的な sendMessage エラーを無視する', async () => {
      const { sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [
              {
                url: 'https://example.com/a',
                title: 'A',
              },
            ],
          },
        ],
      })
      sendMessage.mockImplementationOnce(() => {
        throw new Error('sync runtime error')
      })
      await expect(
        safelyUpdateGroupUrls('group-1', []),
      ).resolves.toBeUndefined()
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'groupEmptied',
        groupId: 'group-1',
      })
    })
    it('undefined の urls を空として扱い、groupEmptied を通知する', async () => {
      const { set, sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [
              {
                url: 'https://example.com/a',
                title: 'A',
              },
            ],
          },
        ],
      })
      await expect(
        safelyUpdateGroupUrls('group-1', undefined),
      ).resolves.toBeUndefined()
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: undefined,
          },
        ],
      })
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'groupEmptied',
        groupId: 'group-1',
      })
    })
    it('URLs が残る場合はメッセージ送信せずにグループの URLs を更新する', async () => {
      const { set, sendMessage } = createChromeMock({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [],
          },
        ],
      })
      const nextUrls = [
        {
          url: 'https://example.com/next',
          title: 'Next',
        },
      ]
      await expect(
        safelyUpdateGroupUrls('group-1', nextUrls),
      ).resolves.toBeUndefined()
      expect(set).toHaveBeenCalledWith({
        savedTabs: [
          {
            id: 'group-1',
            domain: 'example.com',
            urls: nextUrls,
          },
        ],
      })
      expect(sendMessage).not.toHaveBeenCalled()
    })
    it('ストレージ更新に失敗した場合は reject する', async () => {
      const { get } = createChromeMock()
      const error = new Error('storage failed')
      get.mockRejectedValueOnce(error)
      await expect(safelyUpdateGroupUrls('group-1', [])).rejects.toThrow(
        'storage failed',
      )
      expect(console.error).toHaveBeenCalledWith('タブ更新エラー:', error)
    })
  })
})

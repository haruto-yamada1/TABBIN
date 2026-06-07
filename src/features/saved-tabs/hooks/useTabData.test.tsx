// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

import { useTabData } from './useTabData'

const {
  getParentCategoriesMock,
  resolveTabGroupsWithUrlsMock,
  getUserSettingsMock,
  migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorageMock,
} = vi.hoisted(() => ({
  getParentCategoriesMock: vi.fn().mockResolvedValue([]),
  resolveTabGroupsWithUrlsMock: vi.fn(),
  getUserSettingsMock: vi.fn().mockResolvedValue({} as UserSettings),
  migrateParentCategoriesToDomainNamesMock: vi
    .fn()
    .mockResolvedValue(undefined),
  migrateToUrlsStorageMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: getParentCategoriesMock,
}))

vi.mock('@/lib/storage/migration', () => ({
  migrateParentCategoriesToDomainNames:
    migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorage: migrateToUrlsStorageMock,
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: getUserSettingsMock,
}))

vi.mock('@/lib/storage/tabs', () => ({
  resolveTabGroupsWithUrls: resolveTabGroupsWithUrlsMock,
}))

describe('useTabData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    getParentCategoriesMock.mockReset()
    getParentCategoriesMock.mockResolvedValue([])
    resolveTabGroupsWithUrlsMock.mockReset()
// eslint-disable-next-line typescript/require-await
    resolveTabGroupsWithUrlsMock.mockImplementation(async (groups) => groups)
    getUserSettingsMock.mockReset()
    getUserSettingsMock.mockResolvedValue({} as UserSettings)
    migrateParentCategoriesToDomainNamesMock.mockReset()
    migrateParentCategoriesToDomainNamesMock.mockResolvedValue(undefined)
    migrateToUrlsStorageMock.mockReset()
    migrateToUrlsStorageMock.mockResolvedValue(undefined)
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key?: string) => {
            if (key === 'savedTabs') {
              return { savedTabs: [] }
            }
            if (key === 'urls') {
              return { urls: [] }
            }
            return {}
          }),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome
  })

  it('初期ロードで親カテゴリと保存タブを修復して通知する', async () => {
    const settings = {
      removeTabAfterOpen: true,
    } as UserSettings
    const savedTabs: TabGroup[] = [
      {
        id: 'group-by-id',
        domain: 'id.example.com',
        urlIds: ['url-1'],
        urlSubCategories: {
          'url-1': 'Docs',
        },
      },
      {
        id: 'group-by-name',
        domain: 'name.example.com',
        urls: [
          {
            title: 'Legacy',
            url: 'https://name.example.com/legacy',
          },
        ],
      },
      {
        id: 'already-linked',
        domain: 'linked.example.com',
        parentCategoryId: 'existing-category',
      },
    ]
    const repairedCategories = [
      {
        id: 'category-by-id',
        name: 'By ID',
        domains: ['group-by-id'],
        domainNames: [],
      },
      {
        id: 'category-by-name',
        name: 'By Name',
        domains: [],
        domainNames: ['name.example.com'],
      },
      {
        id: 'legacy-category',
        name: 'Legacy',
      } as ParentCategory,
    ]
    getUserSettingsMock.mockResolvedValue(settings)
    getParentCategoriesMock
      .mockResolvedValueOnce([
        {
          id: 'invalid',
          name: 'Invalid',
          domains: ['group-by-id'],
        },
      ])
      .mockResolvedValueOnce(repairedCategories)
    const storageGet = vi.mocked(chrome.storage.local.get) as unknown as {
      mockImplementation: (
        implementation: (key?: string) => Promise<unknown>,
      ) => void
      mockResolvedValueOnce: (value: unknown) => void
    }
// eslint-disable-next-line typescript/require-await
    storageGet.mockImplementation(async (key?: string) => {
      if (key === 'savedTabs') {
        return { savedTabs }
      }
      if (key === 'urls') {
        return {
          urls: [
            {
              id: 'url-1',
              savedAt: 1,
              title: 'One',
              url: 'https://id.example.com/one',
            },
          ],
        }
      }
      return {
        savedTabs,
        urls: [],
      }
    })
    const onCategoriesLoaded = vi.fn()
    const onSettingsLoaded = vi.fn()

    const { result } = renderHook(() =>
      useTabData(onCategoriesLoaded, onSettingsLoaded),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(onSettingsLoaded).toHaveBeenCalledWith(settings)
    expect(onCategoriesLoaded).toHaveBeenCalledWith(repairedCategories)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          ...savedTabs[0],
          parentCategoryId: 'category-by-id',
        },
        {
          ...savedTabs[1],
          parentCategoryId: 'category-by-name',
        },
        savedTabs[2],
      ],
    })
    expect(result.current.tabGroups).toStrictEqual([
      {
        ...savedTabs[0],
        parentCategoryId: 'category-by-id',
      },
      {
        ...savedTabs[1],
        parentCategoryId: 'category-by-name',
      },
      savedTabs[2],
    ])
  })

  it('マイグレーションや保存タブ読み込みの失敗時もロードを終了する', async () => {
    migrateParentCategoriesToDomainNamesMock.mockRejectedValueOnce(
      new Error('category migration failed'),
    )
    migrateToUrlsStorageMock.mockRejectedValueOnce(
      new Error('url migration failed'),
    )
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
      new Error('storage failed'),
    )

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(console.error).toHaveBeenCalledWith(
      '親カテゴリ移行エラー:',
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      'URL管理マイグレーションエラー:',
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      '保存されたタブの読み込みエラー:',
      expect.any(Error),
    )
  })

  it('初期ロードで savedTabs と urls が配列でない場合は空配列として扱う', async () => {
    const storageGet = vi.mocked(chrome.storage.local.get) as unknown as {
      mockImplementation: (
        implementation: (key?: string) => Promise<unknown>,
      ) => void
    }
// eslint-disable-next-line typescript/require-await
    storageGet.mockImplementation(async (key?: string) => {
      if (key === 'savedTabs') {
        return { savedTabs: 'invalid' }
      }
      if (key === 'urls') {
        return { urls: 'invalid' }
      }
      return {}
    })

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tabGroups).toStrictEqual([])
    expect(console.log).toHaveBeenCalledWith('URLレコード数:', 0)
  })

  it('親カテゴリが有効な場合は再マイグレーションせずそのまま読み込む', async () => {
    const validCategories = [
      {
        id: 'category-1',
        name: 'Valid',
        domains: [],
        domainNames: ['example.com'],
      },
    ]
    getParentCategoriesMock.mockResolvedValue(validCategories)

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(migrateParentCategoriesToDomainNamesMock).toHaveBeenCalledTimes(1)
    expect(getParentCategoriesMock).toHaveBeenCalledTimes(1)
  })

  it('refreshTabGroupsWithUrls で URL 解決を一度だけ実行し、tabGroups effect と二重化しない', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1'],
    }

    resolveTabGroupsWithUrlsMock.mockResolvedValue([
      {
        ...group,
        urls: [
          {
            id: 'url-1',
            url: 'https://example.com/a',
            title: 'A',
          },
        ],
      },
    ])

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    resolveTabGroupsWithUrlsMock.mockClear()

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls([group])
    })

    await waitFor(() => {
      expect(result.current.tabGroupsWithUrls).toStrictEqual([
        {
          ...group,
          urls: [
            {
              id: 'url-1',
              url: 'https://example.com/a',
              title: 'A',
            },
          ],
        },
      ])
    })

    expect(resolveTabGroupsWithUrlsMock).toHaveBeenCalledTimes(1)
    expect(resolveTabGroupsWithUrlsMock).toHaveBeenCalledWith([group])
  })

  it('loadTabGroupsWithUrls は空・新形式・旧形式・URLなしを処理する', async () => {
    const groups: TabGroup[] = [
      {
        id: 'new-format',
        domain: 'new.example.com',
        urlIds: ['url-1'],
      },
      {
        id: 'legacy',
        domain: 'legacy.example.com',
        urls: [
          {
            title: 'Legacy',
            url: 'https://legacy.example.com/a',
          },
        ],
      },
      {
        id: 'empty',
        domain: 'empty.example.com',
      },
    ]
    resolveTabGroupsWithUrlsMock.mockResolvedValueOnce(groups)

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      result.current.loadTabGroupsWithUrls([]),
    ).resolves.toStrictEqual([])
    await expect(
      result.current.loadTabGroupsWithUrls(groups),
    ).resolves.toStrictEqual(groups)

    expect(resolveTabGroupsWithUrlsMock).toHaveBeenCalledWith(groups)
  })

  it('URL 解決中に unmount されたら tabGroupsWithUrls を更新しない', async () => {
    let resolveGroups: ((groups: TabGroup[]) => void) | undefined
    resolveTabGroupsWithUrlsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGroups = resolve
      }),
    )

    const { result, unmount } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    unmount()

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      resolveGroups?.([
        {
          id: 'resolved',
          domain: 'resolved.example.com',
        },
      ])
    })

    expect(result.current.tabGroupsWithUrls).toStrictEqual([])
  })

  it('setTabGroups と storage からの refresh は state を更新する', async () => {
    const storedGroups: TabGroup[] = [
      {
        id: 'stored',
        domain: 'stored.example.com',
      },
    ]
    const appendedGroup: TabGroup = {
      id: 'appended',
      domain: 'appended.example.com',
    }
    const storageGet = vi.mocked(chrome.storage.local.get) as unknown as {
      mockImplementation: (
        implementation: (key?: string) => Promise<unknown>,
      ) => void
      mockResolvedValueOnce: (value: unknown) => void
    }
// eslint-disable-next-line typescript/require-await
    storageGet.mockImplementation(async (key?: string) => {
      if (key === 'savedTabs') {
        return { savedTabs: storedGroups }
      }
      if (key === 'urls') {
        return { urls: [] }
      }
      return {}
    })

    const { result } = renderHook(() => useTabData(vi.fn(), vi.fn()))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      result.current.setTabGroups((previous) => [...previous, appendedGroup])
    })

    expect(result.current.tabGroups).toStrictEqual([
      ...storedGroups,
      appendedGroup,
    ])

    act(() => {
      result.current.setTabGroups([appendedGroup])
    })

    expect(result.current.tabGroups).toStrictEqual([appendedGroup])

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual(storedGroups)

    storageGet.mockResolvedValueOnce({})

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual([])

    storageGet.mockResolvedValueOnce({
      savedTabs: 'invalid',
    })

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual([])
  })
})

// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

import { useTabData } from './useTabData'

const {
  loadTabGroupsWithUrlsUseCaseMock,
  getUserSettingsMock,
  migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorageMock,
} = vi.hoisted(() => ({
  loadTabGroupsWithUrlsUseCaseMock: vi.fn(),
  getUserSettingsMock: vi.fn().mockResolvedValue({} as UserSettings),
  migrateParentCategoriesToDomainNamesMock: vi
    .fn()
    .mockResolvedValue(undefined),
  migrateToUrlsStorageMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/storage/migration', () => ({
  migrateParentCategoriesToDomainNames:
    migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorage: migrateToUrlsStorageMock,
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: getUserSettingsMock,
}))

const createTabGroupRepositoryMock = () => ({
  findAll: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  removeByIds: vi.fn().mockResolvedValue(undefined),
  saveAll: vi.fn().mockResolvedValue(undefined),
})

const createUrlRecordRepositoryMock = () => ({
  findAll: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  removeByIds: vi.fn().mockResolvedValue(undefined),
  saveAll: vi.fn().mockResolvedValue(undefined),
})

const createParentCategoryRepositoryMock = () => ({
  findAll: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  removeByIds: vi.fn().mockResolvedValue(undefined),
  saveAll: vi.fn().mockResolvedValue(undefined),
})

let tabGroupRepository: ReturnType<typeof createTabGroupRepositoryMock>
let urlRecordRepository: ReturnType<typeof createUrlRecordRepositoryMock>
let parentCategoryRepository: ReturnType<
  typeof createParentCategoryRepositoryMock
>

const renderUseTabData = (
  onCategoriesLoaded: (categories: ParentCategory[]) => void = vi.fn(),
  onSettingsLoaded: (settings: UserSettings) => void = vi.fn(),
) =>
  renderHook(() =>
    useTabData({
      loadTabGroupsWithUrlsUseCase: loadTabGroupsWithUrlsUseCaseMock as never,
      tabGroupRepository,
      urlRecordRepository,
      parentCategoryRepository,
      onCategoriesLoaded,
      onSettingsLoaded,
    }),
  )

describe('useTabData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    loadTabGroupsWithUrlsUseCaseMock.mockReset()
    loadTabGroupsWithUrlsUseCaseMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (command: any) => ({
        tabGroups: command.tabGroups,
      }),
    )
    getUserSettingsMock.mockReset()
    getUserSettingsMock.mockResolvedValue({} as UserSettings)
    migrateParentCategoriesToDomainNamesMock.mockReset()
    migrateParentCategoriesToDomainNamesMock.mockResolvedValue(undefined)
    migrateToUrlsStorageMock.mockReset()
    migrateToUrlsStorageMock.mockResolvedValue(undefined)
    tabGroupRepository = createTabGroupRepositoryMock()
    urlRecordRepository = createUrlRecordRepositoryMock()
    parentCategoryRepository = createParentCategoryRepositoryMock()
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
    parentCategoryRepository.findAll
      .mockResolvedValueOnce([
        {
          id: 'invalid',
          name: 'Invalid',
          domains: ['group-by-id'],
        },
      ])
      .mockResolvedValueOnce(repairedCategories)
    tabGroupRepository.findAll.mockResolvedValue(savedTabs)
    urlRecordRepository.findAll.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://id.example.com/one',
      },
    ])

    const onCategoriesLoaded = vi.fn()
    const onSettingsLoaded = vi.fn()

    const { result } = renderUseTabData(onCategoriesLoaded, onSettingsLoaded)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(onSettingsLoaded).toHaveBeenCalledWith(settings)
    expect(onCategoriesLoaded).toHaveBeenCalledWith(repairedCategories)
    expect(tabGroupRepository.saveAll).toHaveBeenCalledWith([
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
    tabGroupRepository.findAll.mockRejectedValueOnce(
      new Error('storage failed'),
    )

    const { result } = renderUseTabData()

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

  it('repository から空配列が返った場合はそのまま空状態として扱う', async () => {
    tabGroupRepository.findAll.mockResolvedValue([])
    urlRecordRepository.findAll.mockResolvedValue([])

    const { result } = renderUseTabData()

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
    parentCategoryRepository.findAll.mockResolvedValue(validCategories)

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(migrateParentCategoriesToDomainNamesMock).toHaveBeenCalledTimes(1)
    expect(parentCategoryRepository.findAll).toHaveBeenCalledTimes(1)
  })

  it('refreshTabGroupsWithUrls で URL 解決を一度だけ実行し、tabGroups effect と二重化しない', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1'],
    }

    loadTabGroupsWithUrlsUseCaseMock.mockResolvedValue({
      tabGroups: [
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
      ],
    })

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    loadTabGroupsWithUrlsUseCaseMock.mockClear()

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

    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledTimes(1)
    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledWith({
      tabGroups: [group],
    })
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
    loadTabGroupsWithUrlsUseCaseMock.mockResolvedValueOnce({
      tabGroups: groups,
    })

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      result.current.loadTabGroupsWithUrls([]),
    ).resolves.toStrictEqual([])
    await expect(
      result.current.loadTabGroupsWithUrls(groups),
    ).resolves.toStrictEqual(groups)

    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledWith({
      tabGroups: groups,
    })
  })

  it('URL 解決中に unmount されたら tabGroupsWithUrls を更新しない', async () => {
    let resolveGroups: ((groups: TabGroup[]) => void) | undefined
    loadTabGroupsWithUrlsUseCaseMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGroups = (groups: TabGroup[]) =>
          resolve({ tabGroups: groups } as never)
      }),
    )

    const { result, unmount } = renderUseTabData()

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
    tabGroupRepository.findAll.mockResolvedValue(storedGroups)

    const { result } = renderUseTabData()

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

    tabGroupRepository.findAll.mockResolvedValueOnce([])

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual([])
  })
})

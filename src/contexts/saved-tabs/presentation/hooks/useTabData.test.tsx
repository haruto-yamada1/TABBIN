import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  toSavedTabsTabGroupViewModel,
  toTabGroupFromViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { useTabData } from './useTabData'

const {
  loadTabGroupsWithUrlsUseCaseMock,
  getSavedTabsPageDataQueryMock,
  getSavedTabsQueryMock,
  repairTabGroupParentCategoryIdsUseCaseMock,
  migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorageMock,
} = vi.hoisted(() => ({
  loadTabGroupsWithUrlsUseCaseMock: vi.fn(),
  getSavedTabsPageDataQueryMock: vi.fn(),
  getSavedTabsQueryMock: vi.fn(),
  repairTabGroupParentCategoryIdsUseCaseMock: vi.fn(),
  migrateParentCategoriesToDomainNamesMock: vi
    .fn()
    .mockResolvedValue(undefined),
  migrateToUrlsStorageMock: vi.fn().mockResolvedValue(undefined),
}))

const createMigrationPortMock = () => ({
  migrateParentCategoriesToDomainNames:
    migrateParentCategoriesToDomainNamesMock,
  migrateToUrlsStorage: migrateToUrlsStorageMock,
  migrateDomainStorageToHostname: vi.fn(async () => {}),
})

let migrationPort: ReturnType<typeof createMigrationPortMock>

const renderUseTabData = (
  onCategoriesLoaded: (categories: ParentCategory[]) => void = vi.fn(),
  onSettingsLoaded: (settings: UserSettingsDto) => void = vi.fn(),
) =>
  renderHook(() =>
    useTabData({
      loadTabGroupsWithUrlsUseCase: loadTabGroupsWithUrlsUseCaseMock as never,
      getSavedTabsPageDataQuery: getSavedTabsPageDataQueryMock,
      getSavedTabsQuery: getSavedTabsQueryMock,
      repairTabGroupParentCategoryIdsUseCase:
        repairTabGroupParentCategoryIdsUseCaseMock as never,
      migrationPort,
      onCategoriesLoaded,
      onSettingsLoaded,
    }),
  )

const buildPageData = (params: {
  tabGroups?: readonly TabGroup[]
  parentCategories?: readonly ParentCategory[]
  userSettings?: UserSettingsDto
}) => ({
  tabGroups: (params.tabGroups ?? []).map(toTabGroupFromViewModel),
  parentCategories: params.parentCategories ?? [],
  userSettings: params.userSettings ?? ({} as UserSettingsDto),
})

const toPresentedTabGroup = (group: TabGroup): TabGroup =>
  toSavedTabsTabGroupViewModel(toTabGroupFromViewModel(group))

const toCurrentTabGroups = (groups: readonly TabGroup[]) =>
  groups.map(toTabGroupFromViewModel)

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
    getSavedTabsPageDataQueryMock.mockReset()
    getSavedTabsPageDataQueryMock.mockResolvedValue(buildPageData({}))
    getSavedTabsQueryMock.mockReset()
    getSavedTabsQueryMock.mockResolvedValue([])
    repairTabGroupParentCategoryIdsUseCaseMock.mockReset()
    // 既定では入力をそのまま返す（修復なし）
    repairTabGroupParentCategoryIdsUseCaseMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (command: any) => ({
        tabGroups: command?.tabGroups ?? [],
        updated: false,
      }),
    )
    migrateParentCategoriesToDomainNamesMock.mockReset()
    migrateParentCategoriesToDomainNamesMock.mockResolvedValue(undefined)
    migrateToUrlsStorageMock.mockReset()
    migrateToUrlsStorageMock.mockResolvedValue(undefined)
    migrationPort = createMigrationPortMock()
  })

  it('初期ロードで親カテゴリと保存タブを修復して通知する', async () => {
    const settings = {
      removeTabAfterOpen: true,
    } as UserSettingsDto
    const savedTabs: TabGroup[] = [
      {
        id: 'group-by-id',
        domain: 'id.example.com',
        memberships: ['url-1'].map((urlId) => ({
          urlId,
          ...({ 'url-1': 'Docs' }?.[urlId]
            ? { category: { 'url-1': 'Docs' }[urlId] }
            : {}),
        })),
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
        collections: [
          {
            id: 'group-by-id',
            domain: 'id.example.com',
          },
        ],
      },
      {
        id: 'category-by-name',
        name: 'By Name',
        collections: [
          {
            id: 'group-by-name',
            domain: 'name.example.com',
          },
        ],
      },
      {
        id: 'legacy-category',
        name: 'Legacy',
      } as ParentCategory,
    ]
    getSavedTabsPageDataQueryMock
      .mockResolvedValueOnce(
        buildPageData({
          tabGroups: savedTabs,
          parentCategories: [
            { id: 'invalid', name: 'Invalid' } as ParentCategory,
          ],
          userSettings: settings,
        }),
      )
      .mockResolvedValueOnce(
        buildPageData({
          tabGroups: savedTabs,
          parentCategories: repairedCategories,
          userSettings: settings,
        }),
      )

    // repair use-case は categoryById 修復と categoryByName 修復を行い、
    // `updated: true` を返す
    const expectedRepaired: TabGroup[] = [
      {
        ...savedTabs[0],
        parentCategoryId: 'category-by-id',
      },
      {
        ...savedTabs[1],
        parentCategoryId: 'category-by-name',
      },
      savedTabs[2],
    ]
    repairTabGroupParentCategoryIdsUseCaseMock.mockImplementationOnce(() => ({
      tabGroups: toCurrentTabGroups(expectedRepaired),
      updated: true,
    }))

    const onCategoriesLoaded = vi.fn()
    const onSettingsLoaded = vi.fn()

    const { result } = renderUseTabData(onCategoriesLoaded, onSettingsLoaded)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(onSettingsLoaded).toHaveBeenCalledWith(settings)
    expect(onCategoriesLoaded).toHaveBeenCalledWith(repairedCategories)
    expect(repairTabGroupParentCategoryIdsUseCaseMock).toHaveBeenCalledWith({
      parentCategories: repairedCategories,
      tabGroups: toCurrentTabGroups(savedTabs),
    })
    expect(result.current.tabGroups).toStrictEqual(
      expectedRepaired.map(toPresentedTabGroup),
    )
  })

  it('マイグレーションや保存タブ読み込みの失敗時もロードを終了する', async () => {
    migrateParentCategoriesToDomainNamesMock.mockRejectedValueOnce(
      new Error('category migration failed'),
    )
    migrateToUrlsStorageMock.mockRejectedValueOnce(
      new Error('url migration failed'),
    )
    getSavedTabsPageDataQueryMock.mockRejectedValueOnce(
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

  it('query から空配列が返った場合はそのまま空状態として扱う', async () => {
    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tabGroups).toStrictEqual([])
  })

  it('親カテゴリが有効な場合は再マイグレーションせずそのまま読み込む', async () => {
    const validCategories: ParentCategory[] = [
      {
        id: 'category-1',
        name: 'Valid',
        collections: [].map((id, index) => ({
          id,
          domain: ['example.com'][index] ?? id,
        })),
      },
    ]
    getSavedTabsPageDataQueryMock.mockResolvedValue(
      buildPageData({ parentCategories: validCategories }),
    )

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(migrateParentCategoriesToDomainNamesMock).toHaveBeenCalledTimes(1)
    expect(getSavedTabsPageDataQueryMock).toHaveBeenCalledTimes(1)
  })

  it('refreshTabGroupsWithUrls は引数なしの場合 getSavedTabsQuery で storage から取得する', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      memberships: ['url-1'].map((urlId) => ({ urlId })),
    }

    loadTabGroupsWithUrlsUseCaseMock.mockResolvedValue({
      tabGroups: toCurrentTabGroups([
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
      ]),
    })
    getSavedTabsQueryMock.mockResolvedValueOnce(toCurrentTabGroups([group]))

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    loadTabGroupsWithUrlsUseCaseMock.mockClear()
    getSavedTabsQueryMock.mockClear()

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    await waitFor(() => {
      expect(result.current.tabGroupsWithUrls).toStrictEqual([
        toPresentedTabGroup({
          ...group,
          urls: [
            {
              id: 'url-1',
              url: 'https://example.com/a',
              title: 'A',
            },
          ],
        }),
      ])
    })

    expect(getSavedTabsQueryMock).toHaveBeenCalledTimes(1)
    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledTimes(1)
    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledWith({
      tabGroups: toCurrentTabGroups([group]),
    })
  })

  it('refreshTabGroupsWithUrls は引数ありの場合は storage 取得をスキップする', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      memberships: ['url-1'].map((urlId) => ({ urlId })),
    }

    loadTabGroupsWithUrlsUseCaseMock.mockResolvedValue({
      tabGroups: toCurrentTabGroups([
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
      ]),
    })

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    loadTabGroupsWithUrlsUseCaseMock.mockClear()
    getSavedTabsQueryMock.mockClear()

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls([group])
    })

    await waitFor(() => {
      expect(result.current.tabGroupsWithUrls).toStrictEqual([
        toPresentedTabGroup({
          ...group,
          urls: [
            {
              id: 'url-1',
              url: 'https://example.com/a',
              title: 'A',
            },
          ],
        }),
      ])
    })

    expect(getSavedTabsQueryMock).not.toHaveBeenCalled()
    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledTimes(1)
    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledWith({
      tabGroups: toCurrentTabGroups([group]),
    })
  })

  it('loadTabGroupsWithUrls は空・新形式・旧形式・URLなしを処理する', async () => {
    const groups: TabGroup[] = [
      {
        id: 'new-format',
        domain: 'new.example.com',
        memberships: ['url-1'].map((urlId) => ({ urlId })),
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
      tabGroups: toCurrentTabGroups(groups),
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
    ).resolves.toStrictEqual(groups.map(toPresentedTabGroup))

    expect(loadTabGroupsWithUrlsUseCaseMock).toHaveBeenCalledWith({
      tabGroups: toCurrentTabGroups(groups),
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
    getSavedTabsPageDataQueryMock.mockResolvedValue(
      buildPageData({ tabGroups: storedGroups }),
    )
    getSavedTabsQueryMock.mockResolvedValueOnce(
      toCurrentTabGroups(storedGroups),
    )

    const { result } = renderUseTabData()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      result.current.setTabGroups((previous) => [...previous, appendedGroup])
    })

    expect(result.current.tabGroups).toStrictEqual([
      toPresentedTabGroup(storedGroups[0]),
      appendedGroup,
    ])

    act(() => {
      result.current.setTabGroups([appendedGroup])
    })

    expect(result.current.tabGroups).toStrictEqual([appendedGroup])

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual(
      storedGroups.map(toPresentedTabGroup),
    )

    getSavedTabsQueryMock.mockResolvedValueOnce([])

    await act(async () => {
      await result.current.refreshTabGroupsWithUrls()
    })

    expect(result.current.tabGroups).toStrictEqual([])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TabGroup, UrlRecord } from '@/types/storage'

const mocks = vi.hoisted(() => ({
  createOrUpdateUrlRecordMock:
    vi.fn<(url: string, title: string) => Promise<UrlRecord>>(),
  getDomainCategorySettingsMock: vi.fn(),
  getUrlRecordsMock: vi.fn<() => Promise<UrlRecord[]>>(),
  getUrlRecordsByIdsMock: vi.fn<(ids: string[]) => Promise<UrlRecord[]>>(),
  migrateToUrlsStorageMock: vi.fn().mockResolvedValue(undefined),
  removeUrlFromAllCustomProjectsMock: vi.fn().mockResolvedValue(undefined),
  removeUrlIdsFromAllCustomProjectsMock: vi.fn().mockResolvedValue(undefined),
  saveDomainCategorySettingsMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./url-migration', () => ({
  migrateToUrlsStorage: mocks.migrateToUrlsStorageMock,
}))

vi.mock('./urls', () => ({
  createOrUpdateUrlRecord: mocks.createOrUpdateUrlRecordMock,
  getUrlRecords: mocks.getUrlRecordsMock,
  getUrlRecordsByIds: mocks.getUrlRecordsByIdsMock,
}))

vi.mock('./categories', () => ({
  getDomainCategorySettings: mocks.getDomainCategorySettingsMock,
  saveDomainCategorySettings: mocks.saveDomainCategorySettingsMock,
}))

vi.mock('./projects', () => ({
  removeUrlFromAllCustomProjects: mocks.removeUrlFromAllCustomProjectsMock,
  removeUrlIdsFromAllCustomProjects:
    mocks.removeUrlIdsFromAllCustomProjectsMock,
}))

const loadTabsModule = async () => {
  vi.resetModules()
  return import('./tabs')
}

describe('tabs storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.migrateToUrlsStorageMock.mockResolvedValue(undefined)
    mocks.getDomainCategorySettingsMock.mockResolvedValue([])
    mocks.createOrUpdateUrlRecordMock.mockImplementation(
// eslint-disable-next-line typescript/require-await
      async (url, title) => ({
        id: `id:${url}`,
        savedAt: 1,
        title,
        url,
      }),
    )
  })

  it('複数グループの URL を一度の URL レコード読み出しで解決する', async () => {
    const groups: TabGroup[] = [
      {
        id: 'group-1',
        domain: 'example.com',
        urlIds: ['url-2', 'url-1'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      },
      {
        id: 'group-2',
        domain: 'example.org',
        urlIds: ['url-3', 'missing'],
      },
    ]
    mocks.getUrlRecordsMock.mockResolvedValue([
      {
        id: 'url-1',
        url: 'https://example.com/a',
        title: 'A',
        savedAt: 1,
      },
      {
        id: 'url-2',
        url: 'https://example.com/b',
        title: 'B',
        savedAt: 2,
      },
      {
        id: 'url-3',
        url: 'https://example.org/c',
        title: 'C',
        savedAt: 3,
      },
    ])

    const { resolveTabGroupsWithUrls } = await loadTabsModule()

    await expect(resolveTabGroupsWithUrls(groups)).resolves.toStrictEqual([
      {
        ...groups[0],
        urls: [
          {
            id: 'url-2',
            url: 'https://example.com/b',
            title: 'B',
            savedAt: 2,
            subCategory: undefined,
          },
          {
            id: 'url-1',
            url: 'https://example.com/a',
            title: 'A',
            savedAt: 1,
            subCategory: 'docs',
          },
        ],
      },
      {
        ...groups[1],
        urls: [
          {
            id: 'url-3',
            url: 'https://example.org/c',
            title: 'C',
            savedAt: 3,
            subCategory: undefined,
          },
        ],
      },
    ])

    expect(mocks.migrateToUrlsStorageMock).toHaveBeenCalledTimes(1)
    expect(mocks.getUrlRecordsMock).toHaveBeenCalledTimes(1)
  })

  it('internal helpers は欠損 categoryKeywords/urlIds と新規 domain 設定を扱う', async () => {
    const {
      applySubCategoryMapping,
      buildDomainCategorySetting,
      categorizeUrlIdsByKeywords,
      processTabGroupForBulkDelete,
    } = await loadTabsModule()
    const groupWithoutSubCategories = {
      domain: 'legacy.example.com',
      id: 'legacy-group',
    } as TabGroup
    const groupWithoutUrlIds = {
      domain: 'legacy.example.com',
      id: 'legacy-group',
    } as TabGroup

    expect(
      buildDomainCategorySetting(groupWithoutSubCategories, 'docs', ['guide']),
    ).toStrictEqual({
      categoryKeywords: [
        {
          categoryName: 'docs',
          keywords: ['guide'],
        },
      ],
      domain: 'legacy.example.com',
      subCategories: [],
    })
    expect(
      categorizeUrlIdsByKeywords(
        [
          {
            id: 'url-1',
            savedAt: 1,
            title: 'Guide',
            url: 'https://example.com/guide',
          },
        ],
        undefined,
        {
          existing: 'keep',
        },
      ),
    ).toStrictEqual({
      existing: 'keep',
    })
    expect(
      categorizeUrlIdsByKeywords(
        [
          {
            id: 'url-1',
            savedAt: 1,
            title: 'Guide',
            url: 'https://example.com/guide',
          },
        ],
        [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
      ),
    ).toStrictEqual({
      'url-1': 'docs',
    })
    expect(
      processTabGroupForBulkDelete(groupWithoutUrlIds, new Set(['url-1'])),
    ).toBe(false)
    const groupWithoutUrlSubCategories = {
      domain: 'legacy.example.com',
      id: 'legacy-with-url',
      urlIds: ['url-1'],
    } as TabGroup
    expect(
      processTabGroupForBulkDelete(
        groupWithoutUrlSubCategories,
        new Set(['url-1']),
      ),
    ).toBe(true)
    expect(groupWithoutUrlSubCategories.urlIds).toStrictEqual([])
    const mappingGroups = [groupWithoutUrlIds]
    applySubCategoryMapping(mappingGroups, 'missing-group', { 'url-1': 'docs' })
    expect(mappingGroups[0].urlSubCategories).toBeUndefined()
    applySubCategoryMapping(mappingGroups, 'legacy-group', { 'url-1': 'docs' })
    expect(mappingGroups[0].urlSubCategories).toStrictEqual({ 'url-1': 'docs' })
  })

  it('resolveTabGroupsWithUrls は空配列ならマイグレーションもURL取得もしない', async () => {
    const { resolveTabGroupsWithUrls } = await loadTabsModule()

    await expect(resolveTabGroupsWithUrls([])).resolves.toStrictEqual([])

    expect(mocks.migrateToUrlsStorageMock).not.toHaveBeenCalled()
    expect(mocks.getUrlRecordsMock).not.toHaveBeenCalled()
  })

  it('resolveTabGroupsWithUrls はURL IDを持たないグループを空URLとして返す', async () => {
    mocks.getUrlRecordsMock.mockResolvedValue([])
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
    }

    const { resolveTabGroupsWithUrls } = await loadTabsModule()

    await expect(resolveTabGroupsWithUrls([group])).resolves.toStrictEqual([
      {
        ...group,
        urls: [],
      },
    ])
  })

  it('getTabGroupUrls はURL ID順に解決し存在しないIDを落とす', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-2', 'missing', 'url-1'],
      urlSubCategories: {
        'url-1': 'docs',
      },
    }
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Two',
        url: 'https://example.com/two',
      },
    ])

    const { getTabGroupUrls } = await loadTabsModule()

    await expect(getTabGroupUrls(group)).resolves.toStrictEqual([
      {
        id: 'url-2',
        savedAt: 2,
        subCategory: undefined,
        title: 'Two',
        url: 'https://example.com/two',
      },
      {
        id: 'url-1',
        savedAt: 1,
        subCategory: 'docs',
        title: 'One',
        url: 'https://example.com/one',
      },
    ])
  })

  it('addUrlToTabGroup はURL IDとサブカテゴリを保存し未知グループは無視する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.createOrUpdateUrlRecordMock.mockResolvedValue({
      id: 'url-1',
      savedAt: 1,
      title: 'Doc',
      url: 'https://example.com/doc',
    })

    const { addUrlToTabGroup } = await loadTabsModule()

    await addUrlToTabGroup('group-1', 'https://example.com/doc', 'Doc', 'docs')
    await addUrlToTabGroup('group-1', 'https://example.com/doc', 'Doc', 'docs')
    await addUrlToTabGroup('missing', 'https://example.com/other', 'Other')

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      },
    ])
  })

  it('addUrlToTabGroup は subCategory なしなら urlSubCategories を作らない', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.createOrUpdateUrlRecordMock.mockResolvedValue({
      id: 'url-1',
      savedAt: 1,
      title: 'Doc',
      url: 'https://example.com/doc',
    })

    const { addUrlToTabGroup } = await loadTabsModule()

    await addUrlToTabGroup('group-1', 'https://example.com/doc', 'Doc')

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      },
    ])
  })

  it('subCategory APIs はグループと永続ドメイン設定を更新する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          subCategories: ['docs'],
          urlIds: ['url-1'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getDomainCategorySettingsMock.mockResolvedValue([
      {
        categoryKeywords: [],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Reference',
        url: 'https://example.com/reference',
      },
    ])

    const {
      addSubCategoryToGroup,
      addSubCategoryWithKeywords,
      setCategoryKeywords,
      setUrlSubCategory,
    } = await loadTabsModule()

    await addSubCategoryToGroup('group-1', 'news')
    await addSubCategoryToGroup('missing', 'ignored')
    await setUrlSubCategory('group-1', 'https://example.com/reference', 'docs')
    await setCategoryKeywords('group-1', 'docs', ['ref'])
    await addSubCategoryWithKeywords('group-1', 'tech', ['Reference'])
    await addSubCategoryWithKeywords('group-1', 'plain')

    expect(state.savedTabs[0]).toStrictEqual(
      expect.objectContaining({
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['ref'],
          },
          {
            categoryName: 'tech',
            keywords: ['Reference'],
          },
        ],
        subCategories: ['docs', 'news', 'tech', 'plain'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      }),
    )
    expect(mocks.saveDomainCategorySettingsMock).toHaveBeenCalled()
  })

  it('既存の subCategory と category keywords は重複追加せず更新する', async () => {
    const state = {
      savedTabs: [
        {
          categoryKeywords: [
            {
              categoryName: 'docs',
              keywords: ['old'],
            },
          ],
          domain: 'example.com',
          id: 'group-1',
          subCategories: ['docs'],
        } as TabGroup,
        {
          categoryKeywords: [],
          domain: 'other.example.com',
          id: 'group-2',
          subCategories: [],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    const settings = [
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['old'],
          },
        ],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ]
    mocks.getDomainCategorySettingsMock.mockResolvedValue(settings)

    const { addSubCategoryToGroup, setCategoryKeywords } =
      await loadTabsModule()

    await addSubCategoryToGroup('group-1', 'docs')
    await setCategoryKeywords('group-1', 'docs', ['new'])

    expect(state.savedTabs).toStrictEqual([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['new'],
          },
        ],
        domain: 'example.com',
        id: 'group-1',
        subCategories: ['docs'],
      },
      {
        categoryKeywords: [],
        domain: 'other.example.com',
        id: 'group-2',
        subCategories: [],
      },
    ])
    expect(settings[0].categoryKeywords).toStrictEqual([
      {
        categoryName: 'docs',
        keywords: ['new'],
      },
    ])
  })

  it('setUrlSubCategory は既存 urlSubCategories に上書き保存する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
          urlSubCategories: {
            'url-1': 'docs',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Reference',
        url: 'https://example.com/reference',
      },
    ])

    const { setUrlSubCategory } = await loadTabsModule()

    await setUrlSubCategory('group-1', 'https://example.com/reference', 'news')

    expect(state.savedTabs[0]?.urlSubCategories).toStrictEqual({
      'url-1': 'news',
    })
  })

  it('既存設定に subCategory がある場合はドメイン設定を重複保存しない', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          subCategories: ['docs'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getDomainCategorySettingsMock.mockResolvedValue([
      {
        categoryKeywords: [],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])

    const { addSubCategoryToGroup } = await loadTabsModule()

    await addSubCategoryToGroup('group-1', 'docs')

    expect(mocks.saveDomainCategorySettingsMock).not.toHaveBeenCalled()
  })

  it('autoCategorizeTabs は重複グループを除外しキーワード一致URLを分類する', async () => {
    const state = {
      savedTabs: [
        {
          categoryKeywords: [
            {
              categoryName: 'docs',
              keywords: ['guide'],
            },
          ],
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
        } as TabGroup,
        {
          domain: 'duplicate.example.com',
          id: 'group-1',
          urlIds: ['url-duplicate'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Install Guide',
        url: 'https://example.com/guide',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Release Notes',
        url: 'https://example.com/release',
      },
    ])

    const { autoCategorizeTabs } = await loadTabsModule()

    await autoCategorizeTabs('group-1')

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'group-1',
        urlSubCategories: {
          'url-1': 'docs',
        },
      }),
    ])
  })

  it('autoCategorizeTabs はキーワード未設定なら既存マッピングだけを維持する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
          urlSubCategories: {
            'url-1': 'manual',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Install Guide',
        url: 'https://example.com/guide',
      },
    ])

    const { autoCategorizeTabs } = await loadTabsModule()

    await autoCategorizeTabs('group-1')

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'group-1',
        urlSubCategories: {
          'url-1': 'manual',
        },
      }),
    ])
  })

  it('reorder/delete APIs はURL順序とメタデータを更新し同期削除を呼ぶ', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2', 'url-3'],
          urlSubCategories: {
            'url-1': 'docs',
            'url-2': 'news',
            'url-3': 'tech',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Two',
        url: 'https://example.com/two',
      },
      {
        id: 'url-3',
        savedAt: 3,
        title: 'Three',
        url: 'https://example.com/three',
      },
    ])

    const {
      removeUrlFromTabGroup,
      removeUrlIdsFromTabGroup,
      removeUrlsFromTabGroup,
      reorderTabGroupUrls,
    } = await loadTabsModule()

    await reorderTabGroupUrls('group-1', [
      'https://example.com/three',
      'https://example.com/one',
    ])
    await removeUrlFromTabGroup('group-1', 'https://example.com/one')
    await removeUrlsFromTabGroup('group-1', ['https://example.com/two'])
    await removeUrlIdsFromTabGroup('group-1', ['url-3'])

    expect(state.savedTabs).toStrictEqual([])
    expect(mocks.removeUrlFromAllCustomProjectsMock).toHaveBeenCalledWith(
      'https://example.com/one',
    )
    expect(mocks.removeUrlIdsFromAllCustomProjectsMock).toHaveBeenCalledWith([
      'url-2',
    ])
    expect(mocks.removeUrlIdsFromAllCustomProjectsMock).toHaveBeenCalledWith([
      'url-3',
    ])
  })

  it('removeUrlFromTabGroup は rollback モードなら同期失敗時に savedTabs を復元して throw する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: {
            'url-1': 'docs',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Two',
        url: 'https://example.com/two',
      },
    ])
    mocks.removeUrlFromAllCustomProjectsMock.mockRejectedValueOnce(
      new Error('sync failed'),
    )

    const { removeUrlFromTabGroup } = await loadTabsModule()

    await expect(
      removeUrlFromTabGroup('group-1', 'https://example.com/one', {
        throwOnSyncError: true,
      }),
    ).rejects.toThrow('sync failed')

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      },
    ])
  })

  it('bulk delete APIs は rollback モードなら同期失敗時に savedTabs を復元して throw する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: {
            'url-1': 'docs',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Two',
        url: 'https://example.com/two',
      },
    ])

    const { removeUrlIdsFromTabGroup, removeUrlsFromTabGroup } =
      await loadTabsModule()

    mocks.removeUrlIdsFromAllCustomProjectsMock.mockRejectedValueOnce(
      new Error('sync by ids failed'),
    )
    await expect(
      removeUrlIdsFromTabGroup('group-1', ['url-1'], {
        throwOnSyncError: true,
      }),
    ).rejects.toThrow('sync by ids failed')
    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      },
    ])

    mocks.removeUrlIdsFromAllCustomProjectsMock.mockRejectedValueOnce(
      new Error('sync by urls failed'),
    )
    await expect(
      removeUrlsFromTabGroup('group-1', ['https://example.com/two'], {
        throwOnSyncError: true,
      }),
    ).rejects.toThrow('sync by urls failed')
    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: {
          'url-1': 'docs',
        },
      },
    ])
  })

  it('reorder/delete APIs は未知グループや最後のURL削除を安全に扱う', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
          urlSubCategories: {
            'url-1': 'docs',
          },
        } as TabGroup,
        {
          domain: 'empty.example.com',
          id: 'group-2',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Only',
        url: 'https://example.com/only',
      },
    ])

    const {
      removeUrlFromTabGroup,
      removeUrlIdsFromTabGroup,
      removeUrlsFromTabGroup,
      reorderTabGroupUrls,
    } = await loadTabsModule()

    await reorderTabGroupUrls('missing', ['https://example.com/only'])
    await reorderTabGroupUrls('group-2', ['https://example.com/only'])
    await removeUrlFromTabGroup('missing', 'https://example.com/only')
    await removeUrlFromTabGroup('group-2', 'https://example.com/only')
    await removeUrlIdsFromTabGroup('group-2', ['url-1'])
    await removeUrlsFromTabGroup('group-2', ['https://example.com/only'])
    await removeUrlFromTabGroup('group-1', 'https://example.com/only')

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'empty.example.com',
        id: 'group-2',
      },
    ])
  })

  it('removeUrlIdsFromTabGroup は URL IDs のないグループを変更なしで残す', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'empty.example.com',
          id: 'group-1',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome

    const { removeUrlIdsFromTabGroup } = await loadTabsModule()

    await removeUrlIdsFromTabGroup('group-1', ['url-1'])

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'empty.example.com',
        id: 'group-1',
      },
    ])
  })

  it('removeUrlFromTabGroup は urlSubCategories 未設定でも URL を削除する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'Two',
        url: 'https://example.com/two',
      },
    ])

    const { removeUrlFromTabGroup } = await loadTabsModule()

    await removeUrlFromTabGroup('group-1', 'https://example.com/one')

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-2'],
      },
    ])
  })

  it('removeUrlsFromTabGroup は URL IDs のないグループを変更なしで残す', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'empty.example.com',
          id: 'group-1',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([])

    const { removeUrlsFromTabGroup } = await loadTabsModule()

    await removeUrlsFromTabGroup('group-1', ['https://empty.example.com/a'])

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'empty.example.com',
        id: 'group-1',
      },
    ])
  })

  it('restoreCategorySettings は保存済み設定があればグループへ復元する', async () => {
    mocks.getDomainCategorySettingsMock.mockResolvedValue([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])

    const { restoreCategorySettings } = await loadTabsModule()

    await expect(
      restoreCategorySettings({
        domain: 'example.com',
        id: 'group-1',
      }),
    ).resolves.toStrictEqual({
      categoryKeywords: [
        {
          categoryName: 'docs',
          keywords: ['guide'],
        },
      ],
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['docs'],
    })
    await expect(
      restoreCategorySettings({
        domain: 'missing.example.com',
        id: 'group-2',
      }),
    ).resolves.toStrictEqual({
      domain: 'missing.example.com',
      id: 'group-2',
    })
  })

  it('空/未一致の入力では各 API が安全に no-op する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome

    const {
      autoCategorizeTabs,
      getTabGroupUrls,
      removeUrlIdsFromTabGroup,
      removeUrlsFromTabGroup,
      setCategoryKeywords,
      setUrlSubCategory,
    } = await loadTabsModule()

    await expect(
      getTabGroupUrls({ id: 'empty', domain: 'empty' }),
    ).resolves.toStrictEqual([])
    await setUrlSubCategory('missing', 'https://example.com/a', 'docs')
    await setUrlSubCategory('group-1', 'https://example.com/a', 'docs')
    await setCategoryKeywords('missing', 'docs', ['doc'])
    await autoCategorizeTabs('group-1')
    await removeUrlIdsFromTabGroup('group-1', [])
    await removeUrlIdsFromTabGroup('missing', ['url-1'])
    await removeUrlIdsFromTabGroup('group-1', ['url-1'])
    await removeUrlsFromTabGroup('group-1', [])
    await removeUrlsFromTabGroup('missing', ['https://example.com/a'])
    await removeUrlsFromTabGroup('group-1', ['https://example.com/a'])

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
      },
    ])
  })

  it('URL ID はあるが対象 URL record がない場合は no-op する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([])

    const {
      removeUrlFromTabGroup,
      removeUrlsFromTabGroup,
      reorderTabGroupUrls,
      setUrlSubCategory,
    } = await loadTabsModule()

    await setUrlSubCategory('group-1', 'https://example.com/missing', 'docs')
    await reorderTabGroupUrls('group-1', ['https://example.com/missing'])
    await removeUrlFromTabGroup('group-1', 'https://example.com/missing')
    await removeUrlsFromTabGroup('group-1', ['https://example.com/missing'])

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      },
    ])
  })

  it('カテゴリ設定が未作成のドメインでは subCategory/keywords 設定を新規保存する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          subCategories: [],
          urlIds: ['url-1'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getDomainCategorySettingsMock.mockResolvedValue([])
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Guide',
        url: 'https://example.com/guide',
      },
    ])

    const { addSubCategoryToGroup, setCategoryKeywords } =
      await loadTabsModule()

    await addSubCategoryToGroup('group-1', 'docs')
    await setCategoryKeywords('group-1', 'docs', ['guide'])

    expect(mocks.saveDomainCategorySettingsMock).toHaveBeenCalledWith([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])
  })

  it('setCategoryKeywords は domain 設定がない場合に新規作成する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'new.example.com',
          id: 'group-1',
          subCategories: ['docs'],
          urlIds: ['url-1'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getDomainCategorySettingsMock.mockResolvedValueOnce([])
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([])

    const { setCategoryKeywords } = await loadTabsModule()

    await setCategoryKeywords('group-1', 'docs', ['guide'])

    expect(mocks.saveDomainCategorySettingsMock).toHaveBeenCalledWith([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
        domain: 'new.example.com',
        subCategories: ['docs'],
      },
    ])
  })

  it('legacy group は subCategories と categoryKeywords が未定義でも安全に扱う', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'legacy.example.com',
          id: 'legacy-group',
          urlIds: ['url-1'],
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getDomainCategorySettingsMock.mockResolvedValue([])
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Guide',
        url: 'https://legacy.example.com/guide',
      },
    ])

    const { addSubCategoryToGroup, autoCategorizeTabs, setCategoryKeywords } =
      await loadTabsModule()

    await addSubCategoryToGroup('legacy-group', 'docs')
    state.savedTabs[0].subCategories = undefined
    await setCategoryKeywords('legacy-group', 'docs', ['guide'])
    state.savedTabs[0].categoryKeywords = undefined
    state.savedTabs[0].urlSubCategories = {
      'url-1': 'existing',
    }
    await autoCategorizeTabs('legacy-group')

    expect(mocks.saveDomainCategorySettingsMock).toHaveBeenCalledWith([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
        domain: 'legacy.example.com',
        subCategories: ['docs'],
      },
    ])
    expect(state.savedTabs[0].urlSubCategories).toStrictEqual({
      'url-1': 'existing',
    })
  })

  it('削除同期に失敗してもタブグループ更新自体は完了する', async () => {
    const state = {
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: {
            'url-1': 'docs',
            'url-2': 'news',
          },
        } as TabGroup,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async (value: typeof state) => {
            Object.assign(state, value)
          }),
        },
      },
    } as unknown as typeof chrome
    mocks.getUrlRecordsByIdsMock.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'One',
        url: 'https://example.com/one',
      },
    ])
    mocks.removeUrlFromAllCustomProjectsMock.mockRejectedValueOnce(
      new Error('sync failed'),
    )
    mocks.removeUrlIdsFromAllCustomProjectsMock.mockRejectedValueOnce(
      new Error('bulk sync failed'),
    )

    const { removeUrlFromTabGroup, removeUrlsFromTabGroup } =
      await loadTabsModule()

    await removeUrlFromTabGroup('group-1', 'https://example.com/one')
    await removeUrlsFromTabGroup('group-1', ['https://example.com/one'])

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-2'],
        urlSubCategories: {
          'url-2': 'news',
        },
      },
    ])
  })
})

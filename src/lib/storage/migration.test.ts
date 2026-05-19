import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
} from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0

  return {
    autoCategorizeTabs: vi.fn().mockResolvedValue(undefined),
    createOrUpdateUrlRecord: vi.fn(),
    getDomainCategoryMappings: vi.fn(),
    getParentCategories: vi.fn(),
    getUserSettings: vi.fn(),
    restoreCategorySettings: vi.fn(async (group: TabGroup) => group),
    saveParentCategories: vi.fn().mockResolvedValue(undefined),
    updateDomainCategoryMapping: vi.fn().mockResolvedValue(undefined),
    uuid: vi.fn(() => `uuid-${++uuidIndex}`),
    reset: () => {
      uuidIndex = 0
      mocks.autoCategorizeTabs.mockClear()
      mocks.createOrUpdateUrlRecord.mockClear()
      mocks.getDomainCategoryMappings.mockClear()
      mocks.getParentCategories.mockClear()
      mocks.getUserSettings.mockClear()
      mocks.restoreCategorySettings.mockClear()
      mocks.saveParentCategories.mockClear()
      mocks.updateDomainCategoryMapping.mockClear()
      mocks.uuid.mockClear()
    },
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

vi.mock('./categories', () => ({
  getDomainCategoryMappings: mocks.getDomainCategoryMappings,
  getParentCategories: mocks.getParentCategories,
  saveParentCategories: mocks.saveParentCategories,
  updateDomainCategoryMapping: mocks.updateDomainCategoryMapping,
}))

vi.mock('./settings', () => ({
  getUserSettings: mocks.getUserSettings,
}))

vi.mock('./tabs', () => ({
  autoCategorizeTabs: mocks.autoCategorizeTabs,
  restoreCategorySettings: mocks.restoreCategorySettings,
}))

vi.mock('./urls', () => ({
  createOrUpdateUrlRecord: mocks.createOrUpdateUrlRecord,
}))

interface StorageState {
  domainCategoryMappings?: DomainParentCategoryMapping[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
}

const createChromeStorageLocal = (state: StorageState) => ({
  get: vi.fn(async (keys?: string | string[]) => {
    if (!keys) {
      return state
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(
        keys.map((key) => [key, state[key as keyof StorageState]]),
      )
    }
    return {
      [keys]: state[keys as keyof StorageState],
    }
  }),
  set: vi.fn(async (value: Record<string, unknown>) => {
    Object.assign(state, value)
  }),
})

const createCategory = (
  overrides: Partial<ParentCategory> = {},
): ParentCategory => ({
  domains: overrides.domains ?? [],
  domainNames: overrides.domainNames ?? [],
  id: overrides.id ?? 'category-1',
  name: overrides.name ?? 'Category',
})

const loadModule = async () => {
  vi.resetModules()
  return import('./migration')
}

describe('migration storage facade', () => {
  beforeEach(() => {
    mocks.reset()
    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    mocks.getUserSettings.mockResolvedValue({
      excludePatterns: [],
    })
    mocks.getDomainCategoryMappings.mockResolvedValue([])
    mocks.getParentCategories.mockResolvedValue([])
    mocks.createOrUpdateUrlRecord.mockImplementation(
      async (url: string, title: string) => ({
        id: `id:${url}`,
        savedAt: 1000,
        title,
        url,
      }),
    )
  })

  it('assignDomainToCategory はカテゴリ割当と解除をマッピングへ反映する', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
        },
      ],
    }
    const categories = [
      createCategory({
        domains: [],
        id: 'category-1',
        name: 'Target',
      }),
      createCategory({
        domains: ['group-1'],
        domainNames: ['https://example.com'],
        id: 'category-2',
        name: 'Previous',
      }),
    ]
    mocks.getParentCategories.mockResolvedValue(categories)
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { assignDomainToCategory } = await loadModule()

    await assignDomainToCategory('group-1', 'category-1')
    await assignDomainToCategory('group-1', 'none')

    expect(mocks.updateDomainCategoryMapping).toHaveBeenNthCalledWith(
      1,
      'https://example.com',
      'category-1',
    )
    expect(mocks.updateDomainCategoryMapping).toHaveBeenNthCalledWith(
      2,
      'https://example.com',
      null,
    )
    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domains: ['group-1'],
        domainNames: ['https://example.com'],
        id: 'category-1',
      }),
      expect.objectContaining({
        domains: [],
        domainNames: [],
        id: 'category-2',
      }),
    ])
  })

  it('migrateParentCategoriesToDomainNames はタブ/マッピング/既存値を統合する', async () => {
    const state: StorageState = {
      domainCategoryMappings: [
        {
          categoryId: 'category-1',
          domain: 'https://mapped.example.com',
        },
      ],
      savedTabs: [
        {
          domain: 'https://tab.example.com',
          id: 'group-1',
        },
      ],
    }
    mocks.getParentCategories
      .mockResolvedValueOnce([
        createCategory({
          domains: ['group-1', 'missing-group'],
          domainNames: ['https://existing.example.com'],
          id: 'category-1',
        }),
      ])
      .mockResolvedValueOnce([
        createCategory({
          domainNames: ['https://saved.example.com'],
          id: 'category-1',
        }),
      ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { migrateParentCategoriesToDomainNames } = await loadModule()

    await migrateParentCategoriesToDomainNames()

    expect(state.parentCategories).toEqual([
      expect.objectContaining({
        domainNames: [
          'https://existing.example.com',
          'https://tab.example.com',
          'https://mapped.example.com',
        ],
        id: 'category-1',
      }),
    ])
  })

  it('saveTabs は保存可能タブをドメイン単位で追加し親カテゴリ設定を復元する', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://existing.example.com',
          id: 'existing-group',
          urlIds: ['old-url'],
        },
      ],
    }
    mocks.getDomainCategoryMappings.mockResolvedValue([
      {
        categoryId: 'category-1',
        domain: 'https://mapped.example.com',
      },
    ])
    mocks.getParentCategories.mockResolvedValue([
      createCategory({
        domains: [],
        domainNames: ['https://named.example.com'],
        id: 'category-1',
        name: 'Mapped',
      }),
    ])
    mocks.restoreCategorySettings.mockImplementation(async (group) => ({
      ...group,
      categoryKeywords:
        group.domain === 'https://mapped.example.com'
          ? [
              {
                categoryName: 'docs',
                keywords: ['Guide'],
              },
            ]
          : undefined,
    }))
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        title: 'Existing',
        url: 'https://existing.example.com/a',
      },
      {
        title: 'Mapped Guide',
        url: 'https://mapped.example.com/guide',
      },
      {
        title: 'Named',
        url: 'https://named.example.com/page',
      },
      {
        title: 'Invalid URL',
        url: 'not a url',
      },
      {
        title: 'No URL',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toEqual([
      expect.objectContaining({
        domain: 'https://existing.example.com',
        id: 'existing-group',
        urlIds: ['old-url', 'id:https://existing.example.com/a'],
      }),
      expect.objectContaining({
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['Guide'],
          },
        ],
        domain: 'https://mapped.example.com',
        id: 'uuid-1',
        parentCategoryId: 'category-1',
        urlIds: ['id:https://mapped.example.com/guide'],
      }),
      expect.objectContaining({
        domain: 'https://named.example.com',
        id: 'uuid-2',
        parentCategoryId: 'category-1',
        urlIds: ['id:https://named.example.com/page'],
      }),
    ])
    expect(mocks.updateDomainCategoryMapping).toHaveBeenCalledWith(
      'https://mapped.example.com',
      'category-1',
    )
    expect(mocks.autoCategorizeTabs).toHaveBeenCalledWith('uuid-1')
  })

  it('saveTabs は空 domainNames を検出したら親カテゴリ移行後の値で分類する', async () => {
    const state: StorageState = {
      domainCategoryMappings: [],
      parentCategories: [
        createCategory({
          domains: ['legacy-group'],
          domainNames: [],
          id: 'category-1',
        }),
      ],
      savedTabs: [
        {
          domain: 'https://legacy.example.com',
          id: 'legacy-group',
        },
      ],
    }
    mocks.getParentCategories
      .mockResolvedValueOnce(state.parentCategories)
      .mockResolvedValueOnce(state.parentCategories)
      .mockResolvedValueOnce([
        createCategory({
          domains: ['legacy-group'],
          domainNames: ['https://legacy.example.com'],
          id: 'category-1',
        }),
      ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        title: 'New',
        url: 'https://new.example.com/page',
      },
    ] as chrome.tabs.Tab[])

    expect(state.parentCategories).toEqual([
      expect.objectContaining({
        domainNames: ['https://legacy.example.com'],
      }),
    ])
    expect(state.savedTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'https://new.example.com',
          id: 'uuid-1',
        }),
      ]),
    )
  })

  it('saveTabsWithAutoCategory は重複グループを修復し対象ドメインだけ再分類する', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          categoryKeywords: [
            {
              categoryName: 'docs',
              keywords: ['Guide'],
            },
          ],
          domain: 'https://docs.example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
        {
          domain: 'https://duplicate.example.com',
          id: 'group-1',
          urlIds: ['url-2'],
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabsWithAutoCategory } = await loadModule()

    await saveTabsWithAutoCategory([
      {
        title: 'Guide',
        url: 'https://docs.example.com/guide',
      },
      {
        title: 'Invalid',
        url: 'not a url',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toHaveLength(1)
    expect(mocks.autoCategorizeTabs).toHaveBeenCalledWith('group-1')
  })

  it('assignDomainToCategory は既に割当済みのカテゴリをそのまま保持する', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://already.example.com',
          id: 'group-1',
        },
      ],
    }
    const categories = [
      createCategory({
        domains: ['group-1'],
        domainNames: ['https://already.example.com'],
        id: 'category-1',
      }),
    ]
    mocks.getParentCategories.mockResolvedValue(categories)
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { assignDomainToCategory } = await loadModule()

    await assignDomainToCategory('group-1', 'category-1')

    expect(mocks.saveParentCategories).toHaveBeenCalledWith(categories)
  })

  it('migrateParentCategoriesToDomainNames はストレージエラーを再throwする', async () => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('migration storage failed')
          }),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome

    const { migrateParentCategoriesToDomainNames } = await loadModule()

    await expect(migrateParentCategoriesToDomainNames()).rejects.toThrow(
      'migration storage failed',
    )
  })

  it('saveTabs は壊れたカテゴリ情報や重複IDを安全に処理する', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          categoryKeywords: [
            {
              categoryName: 'docs',
              keywords: ['guide'],
            },
          ],
          domain: 'https://docs.example.com',
          id: 'duplicate-id',
          urlIds: [],
        },
        {
          domain: 'https://duplicate.example.com',
          id: 'duplicate-id',
          urlIds: [],
        },
      ],
    }
    mocks.getDomainCategoryMappings.mockResolvedValue([
      {
        categoryId: 'missing-category',
        domain: 'https://mapped-missing.example.com',
      },
    ])
    mocks.getParentCategories.mockResolvedValue([
      {
        domainNames: [],
        domains: [],
        id: 'broken-category',
        name: 'Broken',
      },
    ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabsWithAutoCategory } = await loadModule()

    await saveTabsWithAutoCategory([
      {
        title: 'Guide',
        url: 'https://docs.example.com/guide',
      },
      {
        title: 'Mapped Missing',
        url: 'https://mapped-missing.example.com/page',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs?.map((group) => group.id)).toEqual([
      'duplicate-id',
      'uuid-1',
    ])
    expect(mocks.autoCategorizeTabs).toHaveBeenCalledWith('duplicate-id')
  })
})

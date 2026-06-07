/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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
// eslint-disable-next-line typescript/require-await
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
      mocks.uuid.mockReset()
      mocks.uuid.mockImplementation(() => `uuid-${++uuidIndex}`)
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
// eslint-disable-next-line typescript/require-await
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
// eslint-disable-next-line typescript/require-await
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
// eslint-disable-next-line typescript/require-await
      async (url: string, title: string) => ({
        id: `id:${url}`,
        savedAt: 1000,
        title,
        url,
      }),
    )
  })

  it('URL 解析 helper は不正URLとURLなしタブを除外する', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getTabDomain, getTabsWithDomains, getUniqueDomainsFromTabs } =
      await loadModule()

    expect(getTabDomain('not a url')).toBeNull()
    expect(getTabDomain('https://docs.example.com/path')).toBe(
      'https://docs.example.com',
    )
    expect(
      getTabsWithDomains([
        {
          title: 'No URL',
        },
        {
          title: 'Invalid',
          url: 'not a url',
        },
        {
          title: 'Docs',
          url: 'https://docs.example.com/path',
        },
      ] as chrome.tabs.Tab[]),
    ).toStrictEqual([
      {
        domain: 'https://docs.example.com',
        tab: {
          title: 'Docs',
          url: 'https://docs.example.com/path',
        },
        url: 'https://docs.example.com/path',
      },
    ])
    expect([
      ...getUniqueDomainsFromTabs([
        {
          title: 'Invalid',
          url: 'not a url',
        },
        {
          title: 'No URL',
        },
        {
          title: 'Docs',
          url: 'https://docs.example.com/path',
        },
      ] as chrome.tabs.Tab[]),
    ]).toStrictEqual(['https://docs.example.com'])
    expect(errorSpy).toHaveBeenCalledTimes(2)
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

    expect(state.parentCategories).toStrictEqual([
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

  it('migrateParentCategoriesToDomainNames は domainNames 欠損と非一致 mapping を扱う', async () => {
    const categoryWithoutDomainNames = createCategory({
      domains: ['group-1'],
      id: 'category-1',
    })
    delete (categoryWithoutDomainNames as Partial<ParentCategory>).domainNames
    const state: StorageState = {
      domainCategoryMappings: [
        {
          categoryId: 'other-category',
          domain: 'https://other.example.com',
        },
      ],
      savedTabs: [
        {
          domain: 'https://tab.example.com',
          id: 'group-1',
        },
      ],
    }
    mocks.getParentCategories.mockResolvedValueOnce([
      categoryWithoutDomainNames,
    ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { migrateParentCategoriesToDomainNames } = await loadModule()

    await migrateParentCategoriesToDomainNames()

    expect(state.parentCategories).toStrictEqual([
      expect.objectContaining({
        domainNames: ['https://tab.example.com'],
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
// eslint-disable-next-line typescript/require-await
    mocks.restoreCategorySettings.mockImplementation(async (group) => ({ // eslint-disable-line
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

    expect(state.savedTabs).toStrictEqual([
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

  it('saveTabs は既存 URL ID と domainNames 欠損親カテゴリを扱う', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://existing.example.com',
          id: 'existing-group',
          urlIds: ['id:https://existing.example.com/a'],
        },
      ],
    }
    const categoryWithoutDomainNames = createCategory({
      domains: [],
      id: 'category-1',
      name: 'Missing names',
    })
    delete (categoryWithoutDomainNames as Partial<ParentCategory>).domainNames
    mocks.getParentCategories.mockResolvedValue([categoryWithoutDomainNames])
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
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'existing-group',
        urlIds: ['id:https://existing.example.com/a'],
      }),
    ])
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

    expect(state.parentCategories).toStrictEqual([
      expect.objectContaining({
        domainNames: ['https://legacy.example.com'],
      }),
    ])
    expect(state.savedTabs).toStrictEqual(
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

  it('saveTabsWithAutoCategory は保存時に生成された重複IDを修復する', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    mocks.uuid.mockReturnValue('duplicated-group-id')
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabsWithAutoCategory } = await loadModule()

    await saveTabsWithAutoCategory([
      {
        title: 'One',
        url: 'https://one.example.com/page',
      },
      {
        title: 'Two',
        url: 'https://two.example.com/page',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toHaveLength(1)
    expect(state.savedTabs?.[0]?.id).toBe('duplicated-group-id')
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

  it('updateCategoryDomains は対象外カテゴリを変更しない', async () => {
    const categoryA = createCategory({
      domainNames: ['https://a.example.com'],
      id: 'category-a',
    })
    const categoryB = createCategory({
      domainNames: ['https://b.example.com'],
      id: 'category-b',
    })
    mocks.getParentCategories.mockResolvedValue([categoryA, categoryB])

    const { updateCategoryDomains } = await loadModule()

    await updateCategoryDomains({
      ...categoryA,
      domainNames: ['https://updated.example.com'],
    })

    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domainNames: ['https://updated.example.com'],
        id: 'category-a',
      }),
      categoryB,
    ])
  })

  it('assignDomainToCategory は domainNames 既存値と未定義カテゴリを扱う', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
        },
      ],
    }
    const targetWithExistingDomain = createCategory({
      domains: [],
      domainNames: ['https://example.com'],
      id: 'category-1',
    })
    const previousWithoutDomainNames = createCategory({
      domains: ['group-1'],
      id: 'category-2',
    })
    delete (previousWithoutDomainNames as Partial<ParentCategory>).domainNames
    const targetWithoutDomainNames = createCategory({
      domains: [],
      id: 'category-3',
    })
    delete (targetWithoutDomainNames as Partial<ParentCategory>).domainNames
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome
    mocks.getParentCategories.mockResolvedValueOnce([
      targetWithExistingDomain,
      previousWithoutDomainNames,
    ])

    const { assignDomainToCategory } = await loadModule()

    await assignDomainToCategory('group-1', 'category-1')

    expect(mocks.saveParentCategories).toHaveBeenLastCalledWith([
      expect.objectContaining({
        domainNames: ['https://example.com'],
        domains: ['group-1'],
        id: 'category-1',
      }),
      expect.objectContaining({
        domainNames: [],
        domains: [],
        id: 'category-2',
      }),
    ])

    mocks.getParentCategories.mockResolvedValueOnce([targetWithoutDomainNames])
    await assignDomainToCategory('group-1', 'category-3')

    expect(mocks.saveParentCategories).toHaveBeenLastCalledWith([
      expect.objectContaining({
        domainNames: ['https://example.com'],
        domains: ['group-1'],
        id: 'category-3',
      }),
    ])
  })

  it('migrateParentCategoriesToDomainNames はストレージエラーを再throwする', async () => {
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
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

    expect(state.savedTabs?.map((group) => group.id)).toStrictEqual([
      'duplicate-id',
      'uuid-1',
    ])
    expect(mocks.autoCategorizeTabs).toHaveBeenCalledWith('duplicate-id')
  })

  it('saveTabs は不正な domainNames と urlIds 欠損の既存グループを扱う', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'https://existing-no-ids.example.com',
          id: 'existing-no-ids',
        },
      ],
    }
    mocks.getParentCategories.mockResolvedValue([
      {
        domains: [],
        domainNames: 'invalid' as unknown as string[],
        id: 'category-invalid',
        name: 'Invalid',
      },
    ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        title: 'Existing No IDs',
        url: 'https://existing-no-ids.example.com/path',
      },
      {
        title: 'New Unmatched',
        url: 'https://new-unmatched.example.com/path',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'https://existing-no-ids.example.com',
          id: 'existing-no-ids',
          urlIds: ['id:https://existing-no-ids.example.com/path'],
        }),
        expect.objectContaining({
          domain: 'https://new-unmatched.example.com',
          id: 'uuid-1',
        }),
      ]),
    )
    expect(state.savedTabs?.[1]).not.toHaveProperty('parentCategoryId')
  })

  it('saveTabs は設定の excludePatterns とタブ title が未定義でも保存する', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    mocks.getUserSettings.mockResolvedValue({})
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        url: 'https://untitled.example.com/path',
      },
    ] as chrome.tabs.Tab[])

    expect(mocks.createOrUpdateUrlRecord).toHaveBeenCalledWith(
      'https://untitled.example.com/path',
      '',
    )
    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        domain: 'https://untitled.example.com',
        urlIds: ['id:https://untitled.example.com/path'],
      }),
    ])
  })

  it('saveTabsWithAutoCategory は重複がない場合は再保存せず対象外ドメインを分類しない', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          categoryKeywords: [],
          domain: 'https://plain.example.com',
          id: 'plain-group',
          urlIds: ['plain-url'],
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
        title: 'Plain',
        url: 'https://plain.example.com/path',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'plain-group',
      }),
    ])
    expect(mocks.autoCategorizeTabs).not.toHaveBeenCalled()
  })

  it('assignDomainToCategory は tabGroup が見つからない場合もカテゴリ配列を保存する', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    const categories = [
      createCategory({
        domains: ['other-group'],
        domainNames: ['https://other.example.com'],
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

    await assignDomainToCategory('missing-group', 'category-1')

    expect(mocks.updateDomainCategoryMapping).not.toHaveBeenCalled()
    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domains: ['other-group', 'missing-group'],
        domainNames: ['https://other.example.com', ''],
      }),
    ])
  })

  it('assignDomainToCategory は tabGroup 欠損時に他カテゴリの domainNames を保持する', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    const categories = [
      createCategory({
        domains: [],
        id: 'target-category',
      }),
      createCategory({
        domains: ['missing-group'],
        domainNames: ['https://legacy.example.com'],
        id: 'previous-category',
      }),
    ]
    mocks.getParentCategories.mockResolvedValue(categories)
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { assignDomainToCategory } = await loadModule()

    await assignDomainToCategory('missing-group', 'target-category')

    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domains: ['missing-group'],
        domainNames: [''],
        id: 'target-category',
      }),
      expect.objectContaining({
        domains: [],
        domainNames: ['https://legacy.example.com'],
        id: 'previous-category',
      }),
    ])
  })

  it('saveTabs は不正 domainNames の親カテゴリへ mapping 経由で割り当てる', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    mocks.getDomainCategoryMappings.mockResolvedValue([
      {
        categoryId: 'category-invalid',
        domain: 'https://mapped-invalid.example.com',
      },
    ])
    mocks.getParentCategories.mockResolvedValue([
      {
        domains: [],
        domainNames: 'invalid' as unknown as string[],
        id: 'category-invalid',
        name: 'Invalid',
      },
    ])
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        title: 'Mapped Invalid',
        url: 'https://mapped-invalid.example.com/page',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        domain: 'https://mapped-invalid.example.com',
        parentCategoryId: 'category-invalid',
      }),
    ])
    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domainNames: ['https://mapped-invalid.example.com'],
        domains: ['uuid-1'],
        id: 'category-invalid',
      }),
    ])
  })

  it('saveTabsWithAutoCategory は設定 fallback と重複なしの通常経路を扱う', async () => {
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
          id: 'docs-group',
          urlIds: [],
        },
      ],
    }
    mocks.getUserSettings.mockResolvedValue({})
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
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'docs-group',
        urlIds: ['id:https://docs.example.com/guide'],
      }),
    ])
    expect(mocks.autoCategorizeTabs).toHaveBeenCalledWith('docs-group')
  })
})

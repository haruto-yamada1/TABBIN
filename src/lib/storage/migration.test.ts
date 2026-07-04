/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type {
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
} from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0

  return {
    autoCategorizeTabs: vi.fn().mockResolvedValue(undefined),
    createOrUpdateUrlRecord: vi.fn(),
    createOrUpdateUrlRecordsBatch: vi.fn(),
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
      mocks.createOrUpdateUrlRecordsBatch.mockClear()
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
  createOrUpdateUrlRecordsBatch: mocks.createOrUpdateUrlRecordsBatch,
}))

interface StorageState {
  domainCategoryMappings?: DomainParentCategoryMapping[]
  domainCategorySettings?: DomainCategorySettings[]
  domainHostnameMigrationCompleted?: boolean
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
    mocks.createOrUpdateUrlRecordsBatch.mockImplementation(
      async (inputs: { title: string; url: string }[]) =>
        new Map(
          inputs.map(({ title, url }) => [
            url,
            {
              id: `id:${url}`,
              savedAt: 1000,
              title,
              url,
            },
          ]),
        ),
    )
  })

  it('URL 解析 helper は不正URLとURLなしタブを除外する', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getTabDomain, getTabsWithDomains, getUniqueDomainsFromTabs } =
      await loadModule()

    expect(getTabDomain('not a url')).toBeNull()
    expect(getTabDomain('https://docs.example.com/path')).toBe(
      'docs.example.com',
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
        domain: 'docs.example.com',
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
    ]).toStrictEqual(['docs.example.com'])
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

    mocks.restoreCategorySettings.mockImplementation(async (group) => ({
      // eslint-disable-line
      ...group,
      categoryKeywords:
        group.domain === 'mapped.example.com'
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
        domain: 'mapped.example.com',
        id: 'uuid-1',
        parentCategoryId: 'category-1',
        urlIds: ['id:https://mapped.example.com/guide'],
      }),
      expect.objectContaining({
        domain: 'named.example.com',
        id: 'uuid-2',
        parentCategoryId: 'category-1',
        urlIds: ['id:https://named.example.com/page'],
      }),
    ])
    expect(mocks.updateDomainCategoryMapping).toHaveBeenCalledWith(
      'mapped.example.com',
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

  it('saveTabs は hostname 形式の既存ドメインへ追加し schemeful の重複ドメインを作らない', async () => {
    const state: StorageState = {
      savedTabs: [
        {
          domain: 'existing.example.com',
          id: 'existing-group',
          parentCategoryId: 'category-1',
          subCategories: ['docs'],
          urlIds: ['old-url'],
          urlSubCategories: {
            'old-url': 'docs',
          },
        },
      ],
    }
    mocks.getParentCategories.mockResolvedValue([
      createCategory({
        domains: ['existing-group'],
        domainNames: ['existing.example.com'],
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
        title: 'New Doc',
        url: 'https://existing.example.com/new-doc',
      },
    ] as chrome.tabs.Tab[])

    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        domain: 'existing.example.com',
        id: 'existing-group',
        parentCategoryId: 'category-1',
        subCategories: ['docs'],
        urlIds: ['old-url', 'id:https://existing.example.com/new-doc'],
        urlSubCategories: {
          'old-url': 'docs',
        },
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
          domain: 'new.example.com',
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
          domain: 'new-unmatched.example.com',
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

    expect(mocks.createOrUpdateUrlRecordsBatch).toHaveBeenCalledWith([
      {
        title: '',
        url: 'https://untitled.example.com/path',
      },
    ])
    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        domain: 'untitled.example.com',
        urlIds: ['id:https://untitled.example.com/path'],
      }),
    ])
  })

  it('saveTabs は複数タブの URL レコードを 1 回の一括更新で作成する', async () => {
    const state: StorageState = {
      savedTabs: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()
    const tabs = [
      {
        title: 'A',
        url: 'https://same.example.com/a',
      },
      {
        title: 'B',
        url: 'https://same.example.com/b',
      },
      {
        title: 'C',
        url: 'https://other.example.com/c',
      },
    ] as chrome.tabs.Tab[]

    await saveTabs(tabs)

    expect(mocks.createOrUpdateUrlRecordsBatch).toHaveBeenCalledOnce()
    expect(mocks.createOrUpdateUrlRecordsBatch).toHaveBeenCalledWith([
      { title: 'A', url: 'https://same.example.com/a' },
      { title: 'B', url: 'https://same.example.com/b' },
      { title: 'C', url: 'https://other.example.com/c' },
    ])
    expect(mocks.createOrUpdateUrlRecord).not.toHaveBeenCalled()
    expect(state.savedTabs).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'same.example.com',
          urlIds: [
            'id:https://same.example.com/a',
            'id:https://same.example.com/b',
          ],
        }),
        expect.objectContaining({
          domain: 'other.example.com',
          urlIds: ['id:https://other.example.com/c'],
        }),
      ]),
    )
  })

  it('saveTabs は異なる新規ドメインを同じ親カテゴリへまとめて割り当てる', async () => {
    const state: StorageState = {
      parentCategories: [
        createCategory({
          domainNames: ['https://seed.example.com'],
          id: 'category-1',
          name: 'Work',
        }),
      ],
      savedTabs: [],
    }
    mocks.getDomainCategoryMappings.mockResolvedValue([
      {
        categoryId: 'category-1',
        domain: 'https://docs.example.com',
      },
      {
        categoryId: 'category-1',
        domain: 'https://issues.example.com',
      },
    ])
    mocks.getParentCategories.mockImplementation(
      async () => state.parentCategories ?? [],
    )
    mocks.saveParentCategories.mockImplementation(
      async (categories: ParentCategory[]) => {
        state.parentCategories = categories
      },
    )
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveTabs } = await loadModule()

    await saveTabs([
      {
        title: 'Docs',
        url: 'https://docs.example.com/a',
      },
      {
        title: 'Issues',
        url: 'https://issues.example.com/b',
      },
    ] as chrome.tabs.Tab[])

    expect(state.parentCategories).toStrictEqual([
      expect.objectContaining({
        domainNames: [
          'https://seed.example.com',
          'docs.example.com',
          'issues.example.com',
        ],
        domains: ['uuid-1', 'uuid-2'],
        id: 'category-1',
      }),
    ])
    expect(state.savedTabs).toStrictEqual([
      expect.objectContaining({
        domain: 'docs.example.com',
        parentCategoryId: 'category-1',
      }),
      expect.objectContaining({
        domain: 'issues.example.com',
        parentCategoryId: 'category-1',
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

  it('assignDomainToCategory は tabGroup が見つからない ID をカテゴリへ追加しない', async () => {
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
        domains: ['other-group'],
        domainNames: ['https://other.example.com'],
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
        domains: [],
        domainNames: [],
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
        domain: 'mapped-invalid.example.com',
        parentCategoryId: 'category-invalid',
      }),
    ])
    expect(mocks.saveParentCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        domainNames: ['mapped-invalid.example.com'],
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

describe('migrateDomainStorageToHostname', () => {
  const setupChrome = (state: StorageState) => {
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome
    return state
  }

  it('スキーム付き savedTabs.domain / parentCategories.domainNames を hostname へ正規化する', async () => {
    const state = setupChrome({
      domainCategoryMappings: [
        { categoryId: 'category-1', domain: 'https://mapped.example.com' },
      ],
      domainCategorySettings: [
        {
          categoryKeywords: [],
          domain: 'https://settings.example.com',
          subCategories: ['docs'],
        },
      ],
      parentCategories: [
        createCategory({
          domainNames: ['https://existing.example.com', 'plain.org'],
          id: 'category-1',
          name: 'Docs',
        }),
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
    })

    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'docs.example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      },
    ])
    expect(state.parentCategories).toStrictEqual([
      expect.objectContaining({
        domainNames: ['existing.example.com', 'plain.org'],
        id: 'category-1',
      }),
    ])
    expect(state.domainCategorySettings).toStrictEqual([
      {
        categoryKeywords: [],
        domain: 'settings.example.com',
        subCategories: ['docs'],
      },
    ])
    expect(state.domainCategoryMappings).toStrictEqual([
      { categoryId: 'category-1', domain: 'mapped.example.com' },
    ])
    expect(state.domainHostnameMigrationCompleted).toBe(true)
  })

  it('大文字混在のスキーム付きドメインも小文字 hostname へ正規化する', async () => {
    const state = setupChrome({
      savedTabs: [{ domain: 'https://Example.COM', id: 'group-1' }],
    })
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(state.savedTabs?.[0]?.domain).toBe('example.com')
  })

  it('既に hostname のデータは変化せず (冪等)', async () => {
    const state = setupChrome({
      parentCategories: [
        createCategory({ domainNames: ['example.com'], id: 'c-1' }),
      ],
      savedTabs: [{ domain: 'example.com', id: 'group-1' }],
    })
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(state.savedTabs?.[0]?.domain).toBe('example.com')
    expect(state.parentCategories?.[0]?.domainNames).toStrictEqual([
      'example.com',
    ])
    expect(state.domainHostnameMigrationCompleted).toBe(true)
  })

  it('完了フラグ済みのときはストレージへ書き込まない (再実行抑制)', async () => {
    const setSpy = vi.fn(async () => {})
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[]) => {
            if (keys === 'domainHostnameMigrationCompleted') {
              return { domainHostnameMigrationCompleted: true }
            }
            return {}
          }),
          set: setSpy,
        },
      },
    } as unknown as typeof chrome

    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('同一セッション内の2回目はメモリフラグで書き込まない', async () => {
    const state = setupChrome({
      savedTabs: [{ domain: 'https://docs.example.com', id: 'group-1' }],
    })
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(state.savedTabs?.[0]?.domain).toBe('docs.example.com')
    // 2回目はモジュールスコープのメモリフラグで早期リターンし set が呼ばれない
    let secondSetCalled = false
    globalThis.chrome.storage.local.set = vi.fn(async () => {
      secondSetCalled = true
    })
    await migrateDomainStorageToHostname()
    expect(secondSetCalled).toBe(false)
  })

  it('正規化結果が無効な値 (host-less / パース失敗) は元の値を保持してデータを悪化させない', async () => {
    const state = setupChrome({
      parentCategories: [
        createCategory({
          domainNames: ['https://', '://invalid', 'good.example.com'],
          id: 'c-1',
        }),
      ],
      savedTabs: [{ domain: 'https://', id: 'group-1' }],
    })
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    // host-less / パース失敗は元の値を保持 (データを悪化させない)
    expect(state.savedTabs?.[0]?.domain).toBe('https://')
    expect(state.parentCategories?.[0]?.domainNames).toStrictEqual([
      'https://',
      '://invalid',
      'good.example.com',
    ])
  })

  it('ドメイン以外のフィールド (urlIds / subCategories / categoryKeywords) を保持する', async () => {
    const state = setupChrome({
      domainCategorySettings: [
        {
          categoryKeywords: [{ categoryName: 'docs', keywords: ['Guide'] }],
          domain: 'https://docs.example.com',
          subCategories: ['docs', 'guide'],
        },
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
          parentCategoryId: 'category-1',
          subCategories: ['docs'],
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: { 'url-1': 'docs' },
        },
      ],
    })
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'docs.example.com',
        id: 'group-1',
        parentCategoryId: 'category-1',
        subCategories: ['docs'],
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: { 'url-1': 'docs' },
      },
    ])
    expect(state.domainCategorySettings).toStrictEqual([
      {
        categoryKeywords: [{ categoryName: 'docs', keywords: ['Guide'] }],
        domain: 'docs.example.com',
        subCategories: ['docs', 'guide'],
      },
    ])
  })

  it('存在しないキーは書き換えず、完了フラグだけ書き込む', async () => {
    const state = setupChrome({})
    const { migrateDomainStorageToHostname } = await loadModule()
    await migrateDomainStorageToHostname()
    expect(state.savedTabs).toBeUndefined()
    expect(state.parentCategories).toBeUndefined()
    expect(state.domainHostnameMigrationCompleted).toBe(true)
  })
})

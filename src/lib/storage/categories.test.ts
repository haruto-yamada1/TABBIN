import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
} from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0
  const nextUuid = () => `uuid-${++uuidIndex}`

  return {
    uuid: vi.fn(() => nextUuid()),
    reset: () => {
      uuidIndex = 0
      mocks.uuid.mockClear()
    },
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

interface StorageState {
  domainCategoryMappings?: DomainParentCategoryMapping[]
  domainCategorySettings?: DomainCategorySettings[]
  parentCategories?: ParentCategory[]
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

const loadModule = async () => {
  vi.resetModules()
  return import('./categories')
}

describe('categories storage', () => {
  beforeEach(() => {
    mocks.reset()
    vi.restoreAllMocks()
  })

  it('親カテゴリを取得・作成・検索できる', async () => {
    const state: StorageState = {
      parentCategories: [
        {
          domainNames: ['https://existing.test'],
          domains: ['group-1'],
          id: 'cat-1',
          name: 'Existing',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      createParentCategory,
      findCategoryByDomainName,
      getParentCategories,
      saveParentCategories,
    } = await loadModule()

    await expect(getParentCategories()).resolves.toEqual(state.parentCategories)
    await expect(
      findCategoryByDomainName('https://existing.test'),
    ).resolves.toEqual(state.parentCategories?.[0])
    await expect(
      findCategoryByDomainName('https://missing.test'),
    ).resolves.toBeNull()

    await saveParentCategories([])
    expect(state.parentCategories).toEqual([])

    const created = await createParentCategory('New Category')
    expect(created).toEqual({
      domainNames: [],
      domains: [],
      id: 'uuid-1',
      name: 'New Category',
    })
    await expect(createParentCategory('new category')).rejects.toThrow(
      'DUPLICATE_CATEGORY_NAME:new category',
    )
  })

  it('ドメイン設定とマッピングを追加・更新・削除できる', async () => {
    const state: StorageState = {
      domainCategoryMappings: [
        {
          categoryId: 'cat-1',
          domain: 'https://existing.test',
        },
      ],
      domainCategorySettings: [
        {
          categoryKeywords: [],
          domain: 'https://existing.test',
          subCategories: ['news'],
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      getDomainCategoryMappings,
      getDomainCategorySettings,
      updateDomainCategoryMapping,
      updateDomainCategorySettings,
    } = await loadModule()

    await updateDomainCategorySettings(
      'https://existing.test',
      ['docs'],
      [
        {
          categoryName: 'docs',
          keywords: ['guide'],
        },
      ],
    )
    await updateDomainCategorySettings('https://new.test', ['tips'], [])

    await expect(getDomainCategorySettings()).resolves.toEqual([
      {
        categoryKeywords: [
          {
            categoryName: 'docs',
            keywords: ['guide'],
          },
        ],
        domain: 'https://existing.test',
        subCategories: ['docs'],
      },
      {
        categoryKeywords: [],
        domain: 'https://new.test',
        subCategories: ['tips'],
      },
    ])

    await updateDomainCategoryMapping('https://existing.test', 'cat-2')
    await updateDomainCategoryMapping('https://new.test', 'cat-3')
    await updateDomainCategoryMapping('https://new.test', null)
    await updateDomainCategoryMapping('https://missing.test', null)

    await expect(getDomainCategoryMappings()).resolves.toEqual([
      {
        categoryId: 'cat-2',
        domain: 'https://existing.test',
      },
    ])
  })

  it('親カテゴリ削除時に関連マッピングも削除し、未存在ならエラーにする', async () => {
    const state: StorageState = {
      domainCategoryMappings: [
        {
          categoryId: 'cat-1',
          domain: 'https://existing.test',
        },
        {
          categoryId: 'cat-2',
          domain: 'https://other.test',
        },
      ],
      parentCategories: [
        {
          domainNames: ['https://existing.test'],
          domains: ['group-1'],
          id: 'cat-1',
          name: 'Delete Me',
        },
        {
          domainNames: ['https://other.test'],
          domains: ['group-2'],
          id: 'cat-2',
          name: 'Keep',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deleteParentCategory } = await loadModule()

    await deleteParentCategory('cat-1')
    expect(state.parentCategories).toEqual([
      {
        domainNames: ['https://other.test'],
        domains: ['group-2'],
        id: 'cat-2',
        name: 'Keep',
      },
    ])
    expect(state.domainCategoryMappings).toEqual([
      {
        categoryId: 'cat-2',
        domain: 'https://other.test',
      },
    ])

    await expect(deleteParentCategory('missing')).rejects.toThrow(
      'カテゴリID missing が見つかりません',
    )
    expect(errorSpy).toHaveBeenCalled()
  })

  it('親カテゴリ削除時に domainNames が欠損していても削除できる', async () => {
    const state: StorageState = {
      domainCategoryMappings: [
        {
          categoryId: 'cat-1',
          domain: 'https://missing-domain-names.test',
        },
      ],
      parentCategories: [
        {
          domains: ['group-1'],
          id: 'cat-1',
          name: 'Missing Domain Names',
        } as unknown as ParentCategory,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deleteParentCategory } = await loadModule()

    await deleteParentCategory('cat-1')

    expect(state.parentCategories).toEqual([])
    expect(state.domainCategoryMappings).toEqual([])
  })
})

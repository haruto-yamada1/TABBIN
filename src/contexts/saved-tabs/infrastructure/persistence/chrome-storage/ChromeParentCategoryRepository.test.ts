import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'

import { createChromeParentCategoryRepository } from './ChromeParentCategoryRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { PARENT_CATEGORIES_KEY } from './savedTabsStorageKeys'

type StorageState = Record<string, unknown>

const createPort = (state: StorageState): ChromeStorageLocalPort => {
  // mock 内で await しない同期関数を async として書くため lint ルールを局所的に解除する
  /* eslint-disable typescript/require-await */
  return {
    get: vi.fn(async (key: string) => ({ [key]: state[key] })),
    remove: vi.fn(async (key: string) => {
      delete state[key]
    }),
    set: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(state, value)
    }),
  }
  /* eslint-enable typescript/require-await */
}

const createSampleParentCategory = (id: string, name: string) =>
  ChromeSavedTabsStorageMapper.parseParentCategory({
    domainNames: [`${name}.example.com`],
    domains: [`group-${id}`],
    id,
    name,
  })

describe('ChromeParentCategoryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('default chrome.storage.local port で read/write する', async () => {
    const state: StorageState = { [PARENT_CATEGORIES_KEY]: [] }
    const local = createPort(state)
    vi.stubGlobal('chrome', { storage: { local } })
    const repository = createChromeParentCategoryRepository()
    const sample = createSampleParentCategory('category-1', 'Docs')
    if (!sample) {
      throw new Error('sample parent category could not be created')
    }

    await expect(repository.findAll()).resolves.toStrictEqual([])
    await repository.saveAll([sample])

    expect(local.get).toHaveBeenCalled()
    expect(local.set).toHaveBeenCalled()
  })

  describe('createChromeParentCategoryRepository (factory)', () => {
    it('port を渡すと repository を返す', () => {
      const repo = createChromeParentCategoryRepository(createPort({}))
      expect(repo.findAll).toBeTypeOf('function')
    })

    it('port が null なら SavedTabsRepositoryUnavailableError を投げる', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      try {
        expect(() => createChromeParentCategoryRepository(null)).toThrow(
          SavedTabsRepositoryUnavailableError,
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('findAll', () => {
    it('空 storage のとき空配列を返す', async () => {
      const repo = createChromeParentCategoryRepository(createPort({}))
      await expect(repo.findAll()).resolves.toStrictEqual([])
    })

    it('PARENT_CATEGORIES_KEY の生データを entity 配列に変換する', async () => {
      const state: StorageState = {
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
          {
            domainNames: [],
            domains: [],
            id: 'cat-2',
            name: 'Empty',
          },
        ],
      }
      const repo = createChromeParentCategoryRepository(createPort(state))
      const result = await repo.findAll()
      expect(result).toHaveLength(2)
      expect(result[0]?.name).toBe('Docs')
      expect(result[0]?.domainNames).toStrictEqual(['docs.example.com'])
      expect(result[1]?.domains).toStrictEqual([])
    })

    it('不正な要素をスキップして有効要素だけ返す', async () => {
      const state: StorageState = {
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
          { domainNames: ['x.example.com'], id: 'cat-2', name: 'NoGroup' },
          null,
          {
            domainNames: ['y.example.com'],
            domains: ['group-2'],
            id: 'cat-3',
            name: 'NoGroup3',
          },
        ],
      }
      const repo = createChromeParentCategoryRepository(createPort(state))
      const result = await repo.findAll()
      expect(result.map((c) => c.id)).toStrictEqual(['cat-1', 'cat-3'])
    })
  })

  describe('findById', () => {
    it('該当 ID の entity を返す', async () => {
      const state: StorageState = {
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
          {
            domainNames: ['work.example.com'],
            domains: ['group-2'],
            id: 'cat-2',
            name: 'Work',
          },
        ],
      }
      const repo = createChromeParentCategoryRepository(createPort(state))
      const result = await repo.findById(createParentCategoryId('cat-2'))
      expect(result?.name).toBe('Work')
    })

    it('存在しない ID は null を返す', async () => {
      const state: StorageState = {
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
        ],
      }
      const repo = createChromeParentCategoryRepository(createPort(state))
      await expect(
        repo.findById(createParentCategoryId('cat-999')),
      ).resolves.toBeNull()
    })
  })

  describe('saveAll', () => {
    it('entity 配列を PARENT_CATEGORIES_KEY に raw 形式で保存する', async () => {
      const port = createPort({})
      const repo = createChromeParentCategoryRepository(port)
      const category = createSampleParentCategory('cat-1', 'Docs')
      expect(category).not.toBeNull()
      if (!category) {
        return
      }
      await repo.saveAll([category])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[PARENT_CATEGORIES_KEY]).toStrictEqual([
        {
          domainNames: ['docs.example.com'],
          domains: ['group-cat-1'],
          id: 'cat-1',
          name: 'Docs',
        },
      ])
    })

    it('空配列を渡したら空配列を保存する', async () => {
      const port = createPort({})
      const repo = createChromeParentCategoryRepository(port)
      await repo.saveAll([])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[PARENT_CATEGORIES_KEY]).toStrictEqual([])
    })
  })

  describe('removeByIds', () => {
    it('指定 ID を除いて保存する', async () => {
      const state: StorageState = {
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
          {
            domainNames: ['work.example.com'],
            domains: ['group-2'],
            id: 'cat-2',
            name: 'Work',
          },
          {
            domainNames: ['side.example.com'],
            domains: ['group-3'],
            id: 'cat-3',
            name: 'Side',
          },
        ],
      }
      const port = createPort(state)
      const repo = createChromeParentCategoryRepository(port)
      await repo.removeByIds([
        createParentCategoryId('cat-1'),
        createParentCategoryId('cat-3'),
      ])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[PARENT_CATEGORIES_KEY]).toStrictEqual([
        {
          domainNames: ['work.example.com'],
          domains: ['group-2'],
          id: 'cat-2',
          name: 'Work',
        },
      ])
    })

    it('存在しない ID を指定しても保存呼び出しは走らない', async () => {
      const port = createPort({
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
        ],
      })
      const repo = createChromeParentCategoryRepository(port)
      await repo.removeByIds([createParentCategoryId('cat-999')])
      expect(port.set).not.toHaveBeenCalled()
    })

    it('空配列を渡したら何もしない', async () => {
      const port = createPort({
        [PARENT_CATEGORIES_KEY]: [
          {
            domainNames: ['docs.example.com'],
            domains: ['group-1'],
            id: 'cat-1',
            name: 'Docs',
          },
        ],
      })
      const repo = createChromeParentCategoryRepository(port)
      await repo.removeByIds([])
      expect(port.set).not.toHaveBeenCalled()
    })
  })
})

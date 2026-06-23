import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'

import {
  createChromeSavedTabsTabGroupReadAdapter,
  createChromeTabGroupRepository,
} from './ChromeTabGroupRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SAVED_TABS_KEY } from './savedTabsStorageKeys'

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

const createSampleTabGroup = (id: string, domain: string) =>
  ChromeSavedTabsStorageMapper.parseTabGroup({
    domain,
    id,
    urlIds: [`url-${id}`],
  })

describe('ChromeTabGroupRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('createChromeTabGroupRepository (factory)', () => {
    it('port を渡すと repository を返す', () => {
      const repo = createChromeTabGroupRepository(createPort({}))
      expect(repo.findAll).toBeTypeOf('function')
    })

    it('port が null なら SavedTabsRepositoryUnavailableError を投げる', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      try {
        expect(() => createChromeTabGroupRepository(null)).toThrow(
          SavedTabsRepositoryUnavailableError,
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('findAll', () => {
    it('空 storage のとき空配列を返す', async () => {
      const repo = createChromeTabGroupRepository(createPort({}))
      await expect(repo.findAll()).resolves.toStrictEqual([])
    })

    it('SAVED_TABS_KEY の生データを TabGroup entity 配列に変換する', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          {
            domain: 'example.com',
            id: 'group-1',
            urlIds: ['url-1'],
          },
          {
            categoryKeywords: [{ categoryName: 'docs', keywords: ['doc'] }],
            domain: 'docs.example.com',
            id: 'group-2',
            parentCategoryId: 'cat-1',
            savedAt: 1_700_000_000_000,
            subCategories: ['docs'],
            urlIds: ['url-2', 'url-3'],
            urlSubCategories: { 'url-2': 'docs' },
          },
        ],
      }
      const repo = createChromeTabGroupRepository(createPort(state))
      const result = await repo.findAll()
      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('group-1')
      expect(result[1]?.urlIds).toStrictEqual(['url-2', 'url-3'])
      expect(result[1]?.parentCategoryId).toBe('cat-1')
    })

    it('不正な要素をスキップして有効要素だけ返す', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          { domain: 'example.com', id: 'group-1' },
          { id: 'group-2' },
          null,
          { domain: 'example.com', id: 'group-3', urlIds: [] },
        ],
      }
      const repo = createChromeTabGroupRepository(createPort(state))
      const result = await repo.findAll()
      expect(result.map((g) => g.id)).toStrictEqual(['group-1', 'group-3'])
    })

    it('配列でない値が storage に入っていても空配列を返す', async () => {
      const state: StorageState = { [SAVED_TABS_KEY]: { not: 'array' } }
      const repo = createChromeTabGroupRepository(createPort(state))
      await expect(repo.findAll()).resolves.toStrictEqual([])
    })
  })

  describe('raw read methods', () => {
    it('findRawDomainById は raw domain を返し、未知IDはnullを返す', async () => {
      const repo = createChromeTabGroupRepository(
        createPort({
          [SAVED_TABS_KEY]: [
            {
              domain: 'https://example.com',
              id: 'group-1',
              urlIds: ['url-1'],
            },
          ],
        }),
      )

      await expect(
        repo.findRawDomainById(createTabGroupId('group-1')),
      ).resolves.toBe('https://example.com')
      await expect(
        repo.findRawDomainById(createTabGroupId('missing')),
      ).resolves.toBeNull()
    })

    it('findRawTabGroupById はrich summaryを返し、未知IDはnullを返す', async () => {
      const repo = createChromeTabGroupRepository(
        createPort({
          [SAVED_TABS_KEY]: [
            {
              categoryKeywords: [
                { categoryName: 'Docs', keywords: ['reference'] },
              ],
              domain: 'example.com',
              id: 'group-1',
              parentCategoryId: 'category-1',
              subCategories: ['Docs'],
            },
          ],
        }),
      )

      await expect(
        repo.findRawTabGroupById(createTabGroupId('group-1')),
      ).resolves.toStrictEqual({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['reference'] }],
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'category-1',
        subCategories: ['Docs'],
      })
      await expect(
        repo.findRawTabGroupById(createTabGroupId('missing')),
      ).resolves.toBeNull()
    })
  })

  describe('SavedTabsTabGroupReadPort', () => {
    it('raw rich fieldをdeep copyして返す', async () => {
      const raw = {
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['reference'] }],
        domain: 'example.com',
        id: 'group-1',
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Docs', 'uncategorized'],
        urlIds: ['url-1'],
        urls: [{ title: 'Example', url: 'https://example.com' }],
        urlSubCategories: { 'url-1': 'Docs' },
      }
      const adapter = createChromeSavedTabsTabGroupReadAdapter(
        createPort({ [SAVED_TABS_KEY]: [raw] }),
      )

      const [result] = await adapter.findAll()

      expect(result).toStrictEqual(raw)
      expect(result?.urlIds).not.toBe(raw.urlIds)
      expect(result?.urls).not.toBe(raw.urls)
      expect(result?.categoryKeywords).not.toBe(raw.categoryKeywords)
    })

    it('optional rich fieldが無いrawも返し、null portを拒否する', async () => {
      const adapter = createChromeSavedTabsTabGroupReadAdapter(
        createPort({
          [SAVED_TABS_KEY]: [{ domain: 'example.com', id: 'group-1' }],
        }),
      )

      await expect(adapter.findAll()).resolves.toStrictEqual([
        { domain: 'example.com', id: 'group-1' },
      ])
      expect(() => createChromeSavedTabsTabGroupReadAdapter(null)).toThrow(
        SavedTabsRepositoryUnavailableError,
      )
    })
  })

  it('default chrome.storage.local portでread/writeする', async () => {
    const state: StorageState = {
      [SAVED_TABS_KEY]: [{ domain: 'example.com', id: 'group-1' }],
    }
    const local = createPort(state)
    vi.stubGlobal('chrome', { storage: { local } })
    const repo = createChromeTabGroupRepository()
    const sample = createSampleTabGroup('group-2', 'docs.example.com')
    if (!sample) {
      throw new Error('sample tab group could not be created')
    }

    await expect(repo.findAll()).resolves.toHaveLength(1)
    await repo.saveAll([sample])

    expect(local.get).toHaveBeenCalled()
    expect(local.set).toHaveBeenCalled()
  })

  describe('findById', () => {
    it('該当 ID の entity を返す', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          { domain: 'a.example.com', id: 'group-1' },
          { domain: 'b.example.com', id: 'group-2' },
        ],
      }
      const repo = createChromeTabGroupRepository(createPort(state))
      const result = await repo.findById(createTabGroupId('group-2'))
      expect(result?.domain).toBe('b.example.com')
    })

    it('存在しない ID は null を返す', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [{ domain: 'https://a.example.com', id: 'group-1' }],
      }
      const repo = createChromeTabGroupRepository(createPort(state))
      await expect(
        repo.findById(createTabGroupId('group-999')),
      ).resolves.toBeNull()
    })
  })

  describe('saveAll', () => {
    it('entity 配列を SAVED_TABS_KEY に raw 形式で保存する', async () => {
      const port = createPort({})
      const repo = createChromeTabGroupRepository(port)
      const group = createSampleTabGroup('group-1', 'example.com')
      expect(group).not.toBeNull()
      if (!group) {
        return
      }
      await repo.saveAll([group])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[SAVED_TABS_KEY]).toStrictEqual([
        { domain: 'example.com', id: 'group-1', urlIds: ['url-group-1'] },
      ])
    })

    it('空配列を渡したら空配列を保存する', async () => {
      const port = createPort({})
      const repo = createChromeTabGroupRepository(port)
      await repo.saveAll([])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[SAVED_TABS_KEY]).toStrictEqual([])
    })

    it('既存 raw のリッチ補助フィールド（urlSubCategories / urls / subCategories 等）を保持する', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          {
            categoryKeywords: [{ categoryName: 'docs', keywords: ['doc'] }],
            domain: 'example.com',
            id: 'group-1',
            parentCategoryId: 'cat-1',
            savedAt: 1_700_000_000_000,
            subCategories: ['docs'],
            subCategoryOrder: ['docs'],
            subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
            urlIds: ['url-remove', 'url-keep'],
            urls: [
              {
                id: 'url-remove',
                title: 'Remove',
                url: 'https://example.com/remove',
              },
              {
                id: 'url-keep',
                title: 'Keep',
                url: 'https://example.com/keep',
              },
            ],
            urlSubCategories: {
              'url-keep': 'docs',
              'url-remove': 'news',
            },
          },
        ],
      }
      const port = createPort(state)
      const repo = createChromeTabGroupRepository(port)
      const entities = await repo.findAll()
      expect(entities).toHaveLength(1)
      // url-remove だけ取り除く形で saveAll を呼ぶ
      const remaining = entities.map((entity) => ({
        ...entity,
        urlIds: entity.urlIds.filter((id) => id !== 'url-remove'),
      }))
      await repo.saveAll(remaining)
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      const savedRaw = (lastSetArg[SAVED_TABS_KEY] as unknown[])[0] as Record<
        string,
        unknown
      >
      expect(savedRaw).toMatchObject({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        savedAt: 1_700_000_000_000,
        urlIds: ['url-keep'],
        urls: [
          {
            id: 'url-keep',
            title: 'Keep',
            url: 'https://example.com/keep',
          },
        ],
        urlSubCategories: { 'url-keep': 'docs' },
        subCategories: ['docs'],
        categoryKeywords: [{ categoryName: 'docs', keywords: ['doc'] }],
        subCategoryOrder: ['docs'],
        subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
      })
    })

    it('既存 raw に不正な要素が混じっていても有効要素のリッチフィールドを保持する', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          // 不正要素（id 無し）
          { domain: 'broken.example.com' },
          // 有効要素 + リッチフィールド
          {
            domain: 'example.com',
            id: 'group-1',
            urlIds: ['url-remove', 'url-keep'],
            urls: [
              {
                id: 'url-remove',
                title: 'Remove',
                url: 'https://example.com/remove',
              },
              {
                id: 'url-keep',
                title: 'Keep',
                url: 'https://example.com/keep',
              },
            ],
            urlSubCategories: { 'url-keep': 'docs' },
          },
          // 不正要素（domain 無し）
          { id: 'broken-2' },
        ],
      }
      const port = createPort(state)
      const repo = createChromeTabGroupRepository(port)
      const entities = await repo.findAll()
      const remaining = entities.map((entity) => ({
        ...entity,
        urlIds: entity.urlIds.filter((id) => id !== 'url-remove'),
      }))
      await repo.saveAll(remaining)
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      const savedRaw = (lastSetArg[SAVED_TABS_KEY] as unknown[])[0] as Record<
        string,
        unknown
      >
      // 不正要素が混じっていても、有効要素の urls / urlSubCategories は
      // merge で持ち越されている必要がある。
      expect(savedRaw).toMatchObject({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-keep'],
        urls: [
          {
            id: 'url-keep',
            title: 'Keep',
            url: 'https://example.com/keep',
          },
        ],
        urlSubCategories: { 'url-keep': 'docs' },
      })
    })
  })

  describe('removeByIds', () => {
    it('指定 ID を除いて保存する', async () => {
      const state: StorageState = {
        [SAVED_TABS_KEY]: [
          { domain: 'a.example.com', id: 'group-1' },
          { domain: 'b.example.com', id: 'group-2' },
          { domain: 'c.example.com', id: 'group-3' },
        ],
      }
      const port = createPort(state)
      const repo = createChromeTabGroupRepository(port)
      await repo.removeByIds([
        createTabGroupId('group-1'),
        createTabGroupId('group-3'),
      ])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[SAVED_TABS_KEY]).toStrictEqual([
        { domain: 'b.example.com', id: 'group-2' },
      ])
    })

    it('存在しない ID を指定しても保存呼び出しは走らない', async () => {
      const port = createPort({
        [SAVED_TABS_KEY]: [{ domain: 'https://a.example.com', id: 'group-1' }],
      })
      const repo = createChromeTabGroupRepository(port)
      await repo.removeByIds([createTabGroupId('group-999')])
      expect(port.set).not.toHaveBeenCalled()
    })

    it('空配列を渡したら何もしない', async () => {
      const port = createPort({
        [SAVED_TABS_KEY]: [{ domain: 'https://a.example.com', id: 'group-1' }],
      })
      const repo = createChromeTabGroupRepository(port)
      await repo.removeByIds([])
      expect(port.set).not.toHaveBeenCalled()
    })
  })
})

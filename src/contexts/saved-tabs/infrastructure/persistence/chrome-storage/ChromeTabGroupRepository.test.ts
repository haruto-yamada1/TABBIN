import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTabGroupId } from '../../../domain/value-objects/TabGroupId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { createChromeTabGroupRepository } from './ChromeTabGroupRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SAVED_TABS_KEY } from './savedTabsStorageKeys'

type StorageState = Record<string, unknown>

const createPort = (state: StorageState): ChromeStorageLocalPort => {
  // mock 内で await しない同期関数を async として書くため lint ルールを局所的に解除する
  /* eslint-disable typescript/require-await */
  return {
    get: vi.fn((key: string) => Promise.resolve({ [key]: state[key] })),
    remove: vi.fn((key: string) => {
      // eslint-disable-next-line typescript/no-dynamic-delete
      delete state[key]
      return Promise.resolve()
    }),
    set: vi.fn((value: Record<string, unknown>) => {
      Object.assign(state, value)
      return Promise.resolve()
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

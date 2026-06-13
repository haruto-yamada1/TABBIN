import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as chromeStorageModule from '@/lib/browser/chrome-storage'

import { createUrlRecordId } from '../../../domain/value-objects/UrlRecordId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import {
  SavedTabsRepositoryUnavailableError,
  createChromeUrlRecordRepository,
} from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { URLS_KEY } from './savedTabsStorageKeys'

vi.mock('@/lib/browser/chrome-storage', async () => {
  const actual = await vi.importActual<typeof chromeStorageModule>(
    '@/lib/browser/chrome-storage',
  )
  return {
    ...actual,
    getChromeStorageLocal: vi.fn(),
  }
})

const getChromeStorageLocal = chromeStorageModule.getChromeStorageLocal

type StorageState = Record<string, unknown>

const createPort = (state: StorageState): ChromeStorageLocalPort => {
  // mock 内で await しない同期関数を async として書くため lint ルールを局所的に解除する
  /* eslint-disable typescript/require-await */
  return {
    get: vi.fn((key: string) => Promise.resolve({ [key]: state[key] })),
    remove: vi.fn((key: string) => {
      // dynamic key 削除は storage エミュレーション上不可避免
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

const createSampleRecord = (id: string, url: string) =>
  ChromeSavedTabsStorageMapper.parseUrlRecord({
    id,
    savedAt: 1,
    title: id,
    url,
  })

describe('ChromeUrlRecordRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createChromeUrlRecordRepository (factory)', () => {
    it('port を渡すと repository を返す', () => {
      const port = createPort({})
      const repo = createChromeUrlRecordRepository(port)
      expect(repo.findAll).toBeTypeOf('function')
    })

    it('port が null なら SavedTabsRepositoryUnavailableError を投げる', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      try {
        expect(() => createChromeUrlRecordRepository(null)).toThrow(
          SavedTabsRepositoryUnavailableError,
        )
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('port 未指定で getChromeStorageLocal が本物の storage を返す場合はそれを使う', async () => {
      const state: StorageState = {}
      vi.mocked(getChromeStorageLocal).mockReturnValue({
        get: (key: string) => Promise.resolve({ [key]: state[key] }),
        remove: (key: string) => {
          // eslint-disable-next-line typescript/no-dynamic-delete
          delete state[key]
          return Promise.resolve()
        },
        set: (value: Record<string, unknown>) => {
          Object.assign(state, value)
          return Promise.resolve()
        },
        // eslint-disable-next-line typescript/no-explicit-any
      } as any)
      const repo = createChromeUrlRecordRepository()
      const result = await repo.findAll()
      expect(result).toStrictEqual([])
    })

    it('port 未指定で getChromeStorageLocal が null を返す場合は throw する', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      vi.mocked(getChromeStorageLocal).mockReturnValue(null)
      try {
        expect(() => createChromeUrlRecordRepository()).toThrow(
          SavedTabsRepositoryUnavailableError,
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('findAll', () => {
    it('空 storage のとき空配列を返す', async () => {
      const repo = createChromeUrlRecordRepository(createPort({}))
      await expect(repo.findAll()).resolves.toStrictEqual([])
    })

    it('URLS_KEY の生データを UrlRecord entity 配列に変換する', async () => {
      const state: StorageState = {
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
          {
            favIconUrl: 'https://example.com/icon.png',
            id: 'url-2',
            savedAt: 2,
            title: 'B',
            url: 'https://example.com/b',
          },
        ],
      }
      const repo = createChromeUrlRecordRepository(createPort(state))
      const result = await repo.findAll()
      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('url-1')
      expect(result[1]?.favIconUrl).toBe('https://example.com/icon.png')
    })

    it('不正な要素をスキップして有効要素だけ返す', async () => {
      const state: StorageState = {
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
          { id: 'url-2', title: 'B', url: 'not-a-url' },
          null,
          { id: 'url-3', savedAt: 3, title: 'C', url: 'https://example.com/c' },
        ],
      }
      const repo = createChromeUrlRecordRepository(createPort(state))
      const result = await repo.findAll()
      expect(result.map((r) => r.id)).toStrictEqual(['url-1', 'url-3'])
    })

    it('配列でない値が storage に入っていても空配列を返す', async () => {
      const state: StorageState = { [URLS_KEY]: 'not-an-array' }
      const repo = createChromeUrlRecordRepository(createPort(state))
      const result = await repo.findAll()
      expect(result).toStrictEqual([])
    })
  })

  describe('findById', () => {
    it('該当 ID の entity を返す', async () => {
      const state: StorageState = {
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
          { id: 'url-2', savedAt: 2, title: 'B', url: 'https://example.com/b' },
        ],
      }
      const repo = createChromeUrlRecordRepository(createPort(state))
      const result = await repo.findById(createUrlRecordId('url-2'))
      expect(result?.id).toBe('url-2')
    })

    it('存在しない ID は null を返す', async () => {
      const state: StorageState = {
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
        ],
      }
      const repo = createChromeUrlRecordRepository(createPort(state))
      await expect(
        repo.findById(createUrlRecordId('url-999')),
      ).resolves.toBeNull()
    })
  })

  describe('saveAll', () => {
    it('entity 配列を URLS_KEY に raw 形式で保存する', async () => {
      const port = createPort({})
      const repo = createChromeUrlRecordRepository(port)
      const record = createSampleRecord('url-1', 'https://example.com/a')
      expect(record).not.toBeNull()
      if (!record) {
        return
      }
      await repo.saveAll([record])
      const setCall = port.set as ReturnType<typeof vi.fn>
      expect(setCall).toHaveBeenCalled()
      const lastSetArg = setCall.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >
      expect(lastSetArg[URLS_KEY]).toStrictEqual([
        {
          id: 'url-1',
          savedAt: 1,
          title: 'url-1',
          url: 'https://example.com/a',
        },
      ])
    })

    it('空配列を渡したら空配列を保存する', async () => {
      const port = createPort({})
      const repo = createChromeUrlRecordRepository(port)
      await repo.saveAll([])
      const setCall = port.set as ReturnType<typeof vi.fn>
      const lastSetArg = setCall.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >
      expect(lastSetArg[URLS_KEY]).toStrictEqual([])
    })
  })

  describe('removeByIds', () => {
    it('指定 ID を除いて保存する', async () => {
      const state: StorageState = {
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
          { id: 'url-2', savedAt: 2, title: 'B', url: 'https://example.com/b' },
          { id: 'url-3', savedAt: 3, title: 'C', url: 'https://example.com/c' },
        ],
      }
      const port = createPort(state)
      const repo = createChromeUrlRecordRepository(port)
      await repo.removeByIds([
        createUrlRecordId('url-1'),
        createUrlRecordId('url-3'),
      ])
      const setCall = port.set as ReturnType<typeof vi.fn>
      const lastSetArg = setCall.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >
      expect(lastSetArg[URLS_KEY]).toStrictEqual([
        { id: 'url-2', savedAt: 2, title: 'B', url: 'https://example.com/b' },
      ])
    })

    it('存在しない ID を指定しても保存呼び出しは走らない', async () => {
      const port = createPort({
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
        ],
      })
      const repo = createChromeUrlRecordRepository(port)
      await repo.removeByIds([createUrlRecordId('url-999')])
      const setCall = port.set as ReturnType<typeof vi.fn>
      expect(setCall).not.toHaveBeenCalled()
    })

    it('空配列を渡したら何もしない', async () => {
      const port = createPort({
        [URLS_KEY]: [
          { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com/a' },
        ],
      })
      const repo = createChromeUrlRecordRepository(port)
      await repo.removeByIds([])
      const setCall = port.set as ReturnType<typeof vi.fn>
      expect(setCall).not.toHaveBeenCalled()
    })
  })
})

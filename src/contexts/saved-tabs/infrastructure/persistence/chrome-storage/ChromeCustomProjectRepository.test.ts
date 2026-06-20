import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCustomProjectId } from '../../../domain/value-objects/CustomProjectId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { createChromeCustomProjectRepository } from './ChromeCustomProjectRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import {
  CUSTOM_PROJECT_ORDER_KEY,
  CUSTOM_PROJECTS_KEY,
} from './savedTabsStorageKeys'

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

const createSampleCustomProject = (id: string, name: string) =>
  ChromeSavedTabsStorageMapper.parseCustomProject({
    categories: ['research'],
    createdAt: 1,
    id,
    name,
    updatedAt: 2,
    urlIds: [`url-${id}`],
  })

describe('ChromeCustomProjectRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createChromeCustomProjectRepository (factory)', () => {
    it('port を渡すと repository を返す', () => {
      const repo = createChromeCustomProjectRepository(createPort({}))
      expect(repo.findAll).toBeTypeOf('function')
    })

    it('port が null なら SavedTabsRepositoryUnavailableError を投げる', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      try {
        expect(() => createChromeCustomProjectRepository(null)).toThrow(
          SavedTabsRepositoryUnavailableError,
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('findAll', () => {
    it('空 storage のとき空配列を返す', async () => {
      const repo = createChromeCustomProjectRepository(createPort({}))
      await expect(repo.findAll()).resolves.toStrictEqual([])
    })

    it('CUSTOM_PROJECTS_KEY の生データを entity 配列に変換する', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
          {
            categories: [],
            createdAt: 1,
            id: 'project-2',
            name: 'Empty',
            updatedAt: 1,
            urlIds: ['url-1', 'url-2'],
          },
        ],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      const result = await repo.findAll()
      expect(result).toHaveLength(2)
      expect(result[0]?.name).toBe('Q4')
      expect(result[1]?.urlIds).toStrictEqual(['url-1', 'url-2'])
    })

    it('不正な要素をスキップして有効要素だけ返す (categories 欠損は legacy データとして通す, issue #530 review P1)', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
          { createdAt: 1, id: 'project-2', name: 'NoCategories', updatedAt: 1 },
          null,
          {
            categories: [],
            createdAt: 1,
            id: 'project-3',
            name: 'Plain',
            updatedAt: 1,
          },
        ],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      const result = await repo.findAll()
      // `categories` 欠損の project-2 は legacy データとして default 反映される。
      // null 要素は依然としてスキップされる。
      expect(result.map((p) => p.id)).toStrictEqual([
        'project-1',
        'project-2',
        'project-3',
      ])
      const noCategories = result.find((p) => p.id === 'project-2')
      expect(noCategories?.categories).toStrictEqual([])
    })
  })

  describe('findById', () => {
    it('該当 ID の entity を返す', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
          {
            categories: ['work'],
            createdAt: 1,
            id: 'project-2',
            name: 'Work',
            updatedAt: 1,
          },
        ],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      const result = await repo.findById(createCustomProjectId('project-2'))
      expect(result?.name).toBe('Work')
    })

    it('存在しない ID は null を返す', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
        ],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      await expect(
        repo.findById(createCustomProjectId('project-999')),
      ).resolves.toBeNull()
    })
  })

  describe('saveAll', () => {
    it('entity 配列を CUSTOM_PROJECTS_KEY に raw 形式で保存する', async () => {
      const port = createPort({})
      const repo = createChromeCustomProjectRepository(port)
      const project = createSampleCustomProject('project-1', 'Q4')
      expect(project).not.toBeNull()
      if (!project) {
        return
      }
      await repo.saveAll([project])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[CUSTOM_PROJECTS_KEY]).toStrictEqual([
        {
          categories: ['research'],
          createdAt: 1,
          id: 'project-1',
          name: 'Q4',
          updatedAt: 2,
          urlIds: ['url-project-1'],
        },
      ])
    })

    it('空配列を渡したら空配列を保存する', async () => {
      const port = createPort({})
      const repo = createChromeCustomProjectRepository(port)
      await repo.saveAll([])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[CUSTOM_PROJECTS_KEY]).toStrictEqual([])
    })

    it('既存 raw のリッチ補助フィールド（projectKeywords / urlMetadata / categoryOrder / urls）を保持する', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            categoryOrder: ['research', 'news'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            projectKeywords: {
              domainKeywords: ['example.com'],
              titleKeywords: ['quarterly'],
              urlKeywords: ['report'],
            },
            updatedAt: 2,
            urlIds: ['url-remove', 'url-keep'],
            urlMetadata: {
              'url-keep': { category: 'research', notes: 'kept' },
              'url-remove': { category: 'news', notes: 'removed' },
            },
            urls: [
              {
                title: 'Legacy entry',
                url: 'https://example.com/legacy',
              },
            ],
          },
        ],
      }
      const port = createPort(state)
      const repo = createChromeCustomProjectRepository(port)
      const entities = await repo.findAll()
      const remaining = entities.map((entity) => ({
        ...entity,
        urlIds: entity.urlIds.filter((id) => id !== 'url-remove'),
      }))
      await repo.saveAll(remaining)
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      const savedRaws = lastSetArg[CUSTOM_PROJECTS_KEY] as unknown[]
      const savedRaw = savedRaws.find(
        (raw) => (raw as Record<string, unknown>)?.id === 'project-1',
      ) as Record<string, unknown>
      expect(savedRaw).toMatchObject({
        categories: ['research'],
        categoryOrder: ['research', 'news'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['quarterly'],
          urlKeywords: ['report'],
        },
        updatedAt: 2,
        urlIds: ['url-keep'],
        urlMetadata: { 'url-keep': { category: 'research', notes: 'kept' } },
        urls: [{ title: 'Legacy entry', url: 'https://example.com/legacy' }],
      })
    })

    it('既存 raw に不正な要素が混じっていても有効要素のリッチフィールドを保持する (issue #530 review P1: categories 欠損は許容)', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          // legacy データ: categories 無しだが raw parse は通る
          { createdAt: 1, id: 'broken', name: 'Broken', updatedAt: 1 },
          // 有効要素 + リッチフィールド
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            projectKeywords: {
              domainKeywords: ['example.com'],
              titleKeywords: ['quarterly'],
              urlKeywords: ['report'],
            },
            updatedAt: 2,
            urlIds: ['url-remove', 'url-keep'],
          },
        ],
      }
      const port = createPort(state)
      const repo = createChromeCustomProjectRepository(port)
      const entities = await repo.findAll()
      const remaining = entities.map((entity) => ({
        ...entity,
        urlIds: entity.urlIds.filter((id) => id !== 'url-remove'),
      }))
      await repo.saveAll(remaining)
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      const savedRaws = lastSetArg[CUSTOM_PROJECTS_KEY] as unknown[]
      const savedRaw = savedRaws.find(
        (raw) => (raw as Record<string, unknown>)?.id === 'project-1',
      ) as Record<string, unknown>
      // 不正要素混入下でも、有効要素の projectKeywords が merge で持ち越される
      expect(savedRaw).toMatchObject({
        id: 'project-1',
        urlIds: ['url-keep'],
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['quarterly'],
          urlKeywords: ['report'],
        },
      })
    })
  })

  describe('removeByIds', () => {
    it('指定 ID を除いて保存する', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
          {
            categories: ['work'],
            createdAt: 1,
            id: 'project-2',
            name: 'Work',
            updatedAt: 1,
          },
          {
            categories: ['side'],
            createdAt: 1,
            id: 'project-3',
            name: 'Side',
            updatedAt: 1,
          },
        ],
      }
      const port = createPort(state)
      const repo = createChromeCustomProjectRepository(port)
      await repo.removeByIds([
        createCustomProjectId('project-1'),
        createCustomProjectId('project-3'),
      ])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[CUSTOM_PROJECTS_KEY]).toStrictEqual([
        {
          categories: ['work'],
          createdAt: 1,
          id: 'project-2',
          name: 'Work',
          updatedAt: 1,
        },
      ])
    })

    it('存在しない ID を指定しても保存呼び出しは走らない', async () => {
      const port = createPort({
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
        ],
      })
      const repo = createChromeCustomProjectRepository(port)
      await repo.removeByIds([createCustomProjectId('project-999')])
      expect(port.set).not.toHaveBeenCalled()
    })

    it('空配列を渡したら何もしない', async () => {
      const port = createPort({
        [CUSTOM_PROJECTS_KEY]: [
          {
            categories: ['research'],
            createdAt: 1,
            id: 'project-1',
            name: 'Q4',
            updatedAt: 1,
          },
        ],
      })
      const repo = createChromeCustomProjectRepository(port)
      await repo.removeByIds([])
      expect(port.set).not.toHaveBeenCalled()
    })
  })

  describe('findOrder', () => {
    it('空 storage のとき空配列を返す', async () => {
      const repo = createChromeCustomProjectRepository(createPort({}))
      await expect(repo.findOrder()).resolves.toStrictEqual([])
    })

    it('CUSTOM_PROJECT_ORDER_KEY の生 string[] を CustomProjectId[] として返す', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECT_ORDER_KEY]: ['project-2', 'project-1'],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      const result = await repo.findOrder()
      expect(result.map((id) => id)).toStrictEqual(['project-2', 'project-1'])
    })

    it('非配列 / 配列でない string / 空文字 / 重複を除外して返す', async () => {
      const state: StorageState = {
        [CUSTOM_PROJECT_ORDER_KEY]: [
          'project-1',
          '',
          null,
          42,
          'project-1',
          'project-2',
        ],
      }
      const repo = createChromeCustomProjectRepository(createPort(state))
      const result = await repo.findOrder()
      expect(result.map((id) => id)).toStrictEqual(['project-1', 'project-2'])
    })
  })

  describe('saveOrder', () => {
    it('CustomProjectId[] を CUSTOM_PROJECT_ORDER_KEY に string[] として保存する', async () => {
      const port = createPort({})
      const repo = createChromeCustomProjectRepository(port)
      await repo.saveOrder([
        createCustomProjectId('project-1'),
        createCustomProjectId('project-2'),
      ])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[CUSTOM_PROJECT_ORDER_KEY]).toStrictEqual([
        'project-1',
        'project-2',
      ])
    })

    it('空配列を渡したら空配列を保存する', async () => {
      const port = createPort({})
      const repo = createChromeCustomProjectRepository(port)
      await repo.saveOrder([])
      const lastSetArg = (port.set as ReturnType<typeof vi.fn>).mock.calls.at(
        -1,
      )?.[0] as Record<string, unknown>
      expect(lastSetArg[CUSTOM_PROJECT_ORDER_KEY]).toStrictEqual([])
    })
  })
})

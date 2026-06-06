import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomProject, TabGroup, UrlRecord } from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0
  const nextUuid = () => `uuid-${++uuidIndex}`

  return {
    invalidateUrlCache: vi.fn(),
    uuid: vi.fn(() => nextUuid()),
    reset: () => {
      uuidIndex = 0
      mocks.invalidateUrlCache.mockClear()
      mocks.uuid.mockClear()
    },
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

vi.mock('./urls', () => ({
  invalidateUrlCache: mocks.invalidateUrlCache,
}))

interface StorageState {
  customProjects?: CustomProject[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[]
  urlsMigrationCompleted?: boolean
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
  return import('./url-migration')
}

describe('url-migration', () => {
  beforeEach(() => {
    mocks.reset()
    vi.restoreAllMocks()
  })

  it('旧形式のsavedTabs/customProjectsをURLストレージへ移行する', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urls: [
            {
              category: 'docs',
              notes: 'keep',
              savedAt: 70,
              title: 'Short',
              url: 'https://shared.test',
            },
            {
              title: 'Unique',
              url: 'https://project.test',
            },
          ],
        },
      ],
      savedTabs: [
        {
          domain: 'https://shared.test',
          id: 'group-1',
          urls: [
            {
              savedAt: 50,
              subCategory: 'news',
              title: 'Longer title',
              url: 'https://shared.test',
            },
            {
              title: 'Tab Unique',
              url: 'https://tab.test',
            },
          ],
        },
      ],
      urls: [
        {
          id: 'existing-1',
          savedAt: 10,
          title: 'Old',
          url: 'https://shared.test',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { migrateToUrlsStorage } = await loadModule()

    vi.spyOn(Date, 'now').mockReturnValue(999)

    await migrateToUrlsStorage()

    expect(state.urlsMigrationCompleted).toBe(true)
    expect(mocks.invalidateUrlCache).toHaveBeenCalledTimes(1)
    expect(state.urls).toStrictEqual([
      {
        id: 'existing-1',
        savedAt: 10,
        title: 'Longer title',
        url: 'https://shared.test',
      },
      {
        favIconUrl: undefined,
        id: 'uuid-1',
        savedAt: 999,
        title: 'Tab Unique',
        url: 'https://tab.test',
      },
      {
        favIconUrl: undefined,
        id: 'uuid-2',
        savedAt: 999,
        title: 'Unique',
        url: 'https://project.test',
      },
    ])
    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'https://shared.test',
        id: 'group-1',
        urlIds: ['existing-1', 'uuid-1'],
        urlSubCategories: {
          'existing-1': 'news',
        },
        urls: undefined,
      },
    ])
    expect(state.customProjects).toStrictEqual([
      {
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 1,
        urlIds: ['existing-1', 'uuid-2'],
        urlMetadata: {
          'existing-1': {
            category: 'docs',
            notes: 'keep',
          },
        },
        urls: undefined,
      },
    ])
  })

  it('完了フラグが立っていれば再実行しない', async () => {
    const storage = createChromeStorageLocal({
      urlsMigrationCompleted: true,
    })
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { migrateToUrlsStorage } = await loadModule()

    await migrateToUrlsStorage()
    await migrateToUrlsStorage()

    expect(storage.set).not.toHaveBeenCalled()
    expect(mocks.invalidateUrlCache).not.toHaveBeenCalled()
  })

  it('不正なストレージ値と URL なし legacy データを安全に移行する', async () => {
    const invalidState = {
      customProjects: 'invalid',
      savedTabs: 'invalid',
      urls: 'invalid',
    } as unknown as StorageState
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(invalidState),
      },
    } as unknown as typeof chrome

    const { migrateToUrlsStorage } = await loadModule()

    await migrateToUrlsStorage()

    expect(invalidState).toStrictEqual(
      expect.objectContaining({
        customProjects: [],
        savedTabs: [],
        urls: [],
        urlsMigrationCompleted: true,
      }),
    )

    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-empty',
          name: 'Project Empty',
          updatedAt: 1,
        },
        {
          categories: [],
          createdAt: 1,
          id: 'project-with-url',
          name: 'Project With URL',
          updatedAt: 1,
          urls: [
            {
              url: 'https://project-no-meta.example.com',
              title: '',
            },
          ],
        },
      ],
      savedTabs: [
        {
          domain: 'https://empty.example.com',
          id: 'group-empty',
        },
        {
          domain: 'https://tab-no-sub.example.com',
          id: 'group-with-url',
          urls: [
            {
              url: 'https://tab-no-sub.example.com/page',
              title: '',
            },
          ],
        },
      ],
      urls: [],
    }
    vi.resetModules()
    mocks.reset()
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { migrateToUrlsStorage: migrateAgain } = await loadModule()

    await migrateAgain()

    expect(state.savedTabs).toStrictEqual([
      {
        domain: 'https://empty.example.com',
        id: 'group-empty',
      },
      {
        domain: 'https://tab-no-sub.example.com',
        id: 'group-with-url',
        urlIds: ['uuid-1'],
        urls: undefined,
      },
    ])
    expect(state.customProjects).toStrictEqual([
      expect.objectContaining({
        id: 'project-empty',
      }),
      expect.objectContaining({
        id: 'project-with-url',
        urlIds: ['uuid-2'],
        urls: undefined,
      }),
    ])
    expect(state.customProjects?.[1]).not.toHaveProperty('urlMetadata')
    expect(state.urls).toStrictEqual([
      {
        favIconUrl: undefined,
        id: 'uuid-1',
        savedAt: 1234,
        title: '',
        url: 'https://tab-no-sub.example.com/page',
      },
      {
        favIconUrl: undefined,
        id: 'uuid-2',
        savedAt: 1234,
        title: '',
        url: 'https://project-no-meta.example.com',
      },
    ])
  })

  it('二度目の呼び出しで完了フラグが外れていれば再実行する', async () => {
    const state: StorageState = {
      customProjects: [],
      savedTabs: [],
      urls: [],
      urlsMigrationCompleted: true,
    }
    const storage = createChromeStorageLocal(state)
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { migrateToUrlsStorage } = await loadModule()

    await migrateToUrlsStorage()
    state.urlsMigrationCompleted = false
    await migrateToUrlsStorage()

    expect(storage.set).toHaveBeenCalledWith({
      customProjects: [],
      savedTabs: [],
      urls: [],
      urlsMigrationCompleted: true,
    })
    expect(mocks.invalidateUrlCache).toHaveBeenCalledTimes(1)
  })

  it('エラー時はログ出力して再送出する', async () => {
    const storage = createChromeStorageLocal({})
    storage.get.mockRejectedValue(new Error('storage failed'))
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { migrateToUrlsStorage } = await loadModule()

    await expect(migrateToUrlsStorage()).rejects.toThrow('storage failed')
    expect(errorSpy).toHaveBeenCalled()
  })
})

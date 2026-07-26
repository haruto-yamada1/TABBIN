/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProject, TabGroup, UrlRecord } from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0
  const nextUuid = () => `uuid-${++uuidIndex}`

  return {
    uuid: vi.fn(() => nextUuid()),
    resetUuid: () => {
      uuidIndex = 0
      mocks.uuid.mockClear()
    },
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

type StorageState = {
  customProjects?: CustomProject[]
  savedTabs?: TabGroup[]
  // eslint-disable-next-line typescript/no-redundant-type-constituents
  urls?: UrlRecord[] | unknown
}

type ChromeStorageLocalOptions = {
  cloneReads?: boolean
  getSetDelayMs?: (value: Record<string, unknown>) => number
}

const createChromeStorageLocal = (
  state: StorageState,
  options: ChromeStorageLocalOptions = {},
) => {
  const readValue = <T>(value: T): T =>
    options.cloneReads ? structuredClone(value) : value

  return {
    get: vi.fn(async (keys?: string | string[]) => {
      if (!keys) {
        return readValue(state)
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys.map((key) => [key, readValue(state[key as keyof StorageState])]),
        )
      }

      return {
        [keys]: readValue(state[keys as keyof StorageState]),
      }
    }),

    set: vi.fn(async (value: Record<string, unknown>) => {
      const delayMs = options.getSetDelayMs?.(value) ?? 0
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      Object.assign(state, value)
    }),
  }
}

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const createChromeStorageOnChanged = () => {
  const listeners: StorageChangeListener[] = []
  const addListener = vi.fn((listener: StorageChangeListener) => {
    listeners.push(listener)
  })
  const removeListener = vi.fn((listener: StorageChangeListener) => {
    const listenerIndex = listeners.indexOf(listener)
    if (listenerIndex >= 0) {
      listeners.splice(listenerIndex, 1)
    }
  })

  return {
    addListener,
    api: {
      addListener,
      removeListener,
    } as unknown as typeof chrome.storage.onChanged,
    emit: (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      listeners.forEach((listener) => {
        listener(changes, areaName)
      })
    },
    listenerCount: () => listeners.length,
    removeListener,
  }
}

const createDeferred = <T>() => {
  let resolveDeferred: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve
  })

  return {
    promise,
    resolve: (value: T) => {
      if (resolveDeferred === null) {
        throw new Error('deferred promise is not initialized')
      }
      resolveDeferred(value)
    },
  }
}

const loadUrlsModule = async () => {
  vi.resetModules()
  return import('./urls')
}

describe('urls storage', () => {
  beforeEach(() => {
    mocks.resetUuid()
    vi.restoreAllMocks()
  })

  describe('URL cache', () => {
    it('external urls change invalidates the context-local cache', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const secondRecords: UrlRecord[] = [
        {
          id: 'second',
          savedAt: 2,
          title: 'Second',
          url: 'https://example.com/second',
        },
      ]
      const state: StorageState = { urls: firstRecords }
      const local = createChromeStorageLocal(state)
      const storageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)

      state.urls = secondRecords
      storageOnChanged.emit(
        {
          urls: {
            newValue: secondRecords,
            oldValue: firstRecords,
          },
        },
        'local',
      )

      await expect(getUrlRecords()).resolves.toStrictEqual(secondRecords)
      expect(local.get).toHaveBeenCalledTimes(2)
    })

    it('in-flight read cannot resurrect cache after external urls change', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const secondRecords: UrlRecord[] = [
        {
          id: 'second',
          savedAt: 2,
          title: 'Second',
          url: 'https://example.com/second',
        },
      ]
      const firstRead = createDeferred<{ urls: UrlRecord[] }>()
      const local = {
        get: vi
          .fn()
          .mockImplementationOnce(async () => firstRead.promise)
          .mockResolvedValue({ urls: secondRecords }),
        set: vi.fn(),
      }
      const storageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      const oldSnapshotRead = getUrlRecords()
      storageOnChanged.emit(
        {
          urls: {
            newValue: secondRecords,
            oldValue: firstRecords,
          },
        },
        'local',
      )
      firstRead.resolve({ urls: firstRecords })

      await expect(oldSnapshotRead).resolves.toStrictEqual(firstRecords)
      await expect(getUrlRecords()).resolves.toStrictEqual(secondRecords)
      expect(local.get).toHaveBeenCalledTimes(2)
    })

    it('reads bypass the cache when onChanged is unavailable', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const secondRecords: UrlRecord[] = [
        {
          id: 'second',
          savedAt: 2,
          title: 'Second',
          url: 'https://example.com/second',
        },
      ]
      const state: StorageState = { urls: firstRecords }
      const local = createChromeStorageLocal(state)
      globalThis.chrome = {
        storage: {
          local,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)
      state.urls = secondRecords
      await expect(getUrlRecords()).resolves.toStrictEqual(secondRecords)
      expect(local.get).toHaveBeenCalledTimes(2)
    })

    it('registers only one urls listener per module context', async () => {
      const state: StorageState = { urls: [] }
      const local = createChromeStorageLocal(state)
      const storageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await getUrlRecords()
      await getUrlRecords()
      await getUrlRecords()

      expect(storageOnChanged.addListener).toHaveBeenCalledOnce()
      expect(local.get).toHaveBeenCalledOnce()
    })

    it('moves one stable urls listener across onChanged API objects', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const secondRecords: UrlRecord[] = [
        {
          id: 'second',
          savedAt: 2,
          title: 'Second',
          url: 'https://example.com/second',
        },
      ]
      const thirdRecords: UrlRecord[] = [
        {
          id: 'third',
          savedAt: 3,
          title: 'Third',
          url: 'https://example.com/third',
        },
      ]
      const state: StorageState = { urls: firstRecords }
      const local = createChromeStorageLocal(state)
      const firstStorageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: firstStorageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)

      const secondStorageOnChanged = createChromeStorageOnChanged()
      state.urls = secondRecords
      globalThis.chrome = {
        storage: {
          local,
          onChanged: secondStorageOnChanged.api,
        },
      } as unknown as typeof chrome

      await expect(getUrlRecords()).resolves.toStrictEqual(secondRecords)

      state.urls = thirdRecords
      globalThis.chrome = {
        storage: {
          local,
          onChanged: firstStorageOnChanged.api,
        },
      } as unknown as typeof chrome

      await expect(getUrlRecords()).resolves.toStrictEqual(thirdRecords)

      const stableListener =
        firstStorageOnChanged.addListener.mock.calls[0]?.[0]
      expect(firstStorageOnChanged.addListener).toHaveBeenCalledTimes(2)
      expect(firstStorageOnChanged.removeListener).toHaveBeenCalledOnce()
      expect(firstStorageOnChanged.listenerCount()).toBe(1)
      expect(secondStorageOnChanged.addListener).toHaveBeenCalledOnce()
      expect(secondStorageOnChanged.removeListener).toHaveBeenCalledOnce()
      expect(secondStorageOnChanged.listenerCount()).toBe(0)
      expect(secondStorageOnChanged.addListener).toHaveBeenCalledWith(
        stableListener,
      )
      expect(firstStorageOnChanged.addListener).toHaveBeenLastCalledWith(
        stableListener,
      )
      expect(local.get).toHaveBeenCalledTimes(3)
    })

    it('does not reuse cache after the onChanged API returns', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const secondRecords: UrlRecord[] = [
        {
          id: 'second',
          savedAt: 2,
          title: 'Second',
          url: 'https://example.com/second',
        },
      ]
      const thirdRecords: UrlRecord[] = [
        {
          id: 'third',
          savedAt: 3,
          title: 'Third',
          url: 'https://example.com/third',
        },
      ]
      const state: StorageState = { urls: firstRecords }
      const local = createChromeStorageLocal(state)
      const storageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)

      state.urls = secondRecords
      globalThis.chrome = {
        storage: {
          local,
        },
      } as unknown as typeof chrome
      await expect(getUrlRecords()).resolves.toStrictEqual(secondRecords)

      state.urls = thirdRecords
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      await expect(getUrlRecords()).resolves.toStrictEqual(thirdRecords)
      expect(storageOnChanged.addListener).toHaveBeenCalledTimes(2)
      expect(storageOnChanged.removeListener).toHaveBeenCalledOnce()
      expect(storageOnChanged.listenerCount()).toBe(1)
      expect(local.get).toHaveBeenCalledTimes(3)
    })

    it('ignores non-local, non-urls, and inherited urls cache changes', async () => {
      const firstRecords: UrlRecord[] = [
        {
          id: 'first',
          savedAt: 1,
          title: 'First',
          url: 'https://example.com/first',
        },
      ]
      const state: StorageState = { urls: firstRecords }
      const local = createChromeStorageLocal(state)
      const storageOnChanged = createChromeStorageOnChanged()
      globalThis.chrome = {
        storage: {
          local,
          onChanged: storageOnChanged.api,
        },
      } as unknown as typeof chrome

      const { getUrlRecords } = await loadUrlsModule()

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)

      state.urls = []
      storageOnChanged.emit({ urls: { newValue: [] } }, 'sync')
      storageOnChanged.emit({ savedTabs: { newValue: [] } }, 'local')
      const inheritedUrlsChange = Object.create({
        urls: { newValue: [] },
      }) as Record<string, chrome.storage.StorageChange>
      storageOnChanged.emit(inheritedUrlsChange, 'local')

      await expect(getUrlRecords()).resolves.toStrictEqual(firstRecords)
      expect(storageOnChanged.addListener).toHaveBeenCalledOnce()
      expect(local.get).toHaveBeenCalledOnce()
    })
  })

  it('URLレコードを作成・更新・検索できる', async () => {
    const state: StorageState = {}
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      createOrUpdateUrlRecord,
      findUrlRecordByUrl,
      getUrlRecordById,
      getUrlRecords,
      getUrlRecordsByIds,
    } = await loadUrlsModule()

    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValue(200)

    const created = await createOrUpdateUrlRecord(
      'https://example.com',
      'Example',
      'icon-1',
    )

    expect(created).toStrictEqual({
      favIconUrl: 'icon-1',
      id: 'uuid-1',
      savedAt: 100,
      title: 'Example',
      url: 'https://example.com',
    })
    await expect(getUrlRecordById('uuid-1')).resolves.toStrictEqual(created)
    await expect(
      findUrlRecordByUrl('https://example.com'),
    ).resolves.toStrictEqual(created)
    await expect(
      getUrlRecordsByIds(['uuid-1', 'missing']),
    ).resolves.toStrictEqual([created])

    const updated = await createOrUpdateUrlRecord(
      'https://example.com',
      'Updated',
      'icon-2',
    )

    expect(updated).toStrictEqual({
      favIconUrl: 'icon-2',
      id: 'uuid-1',
      savedAt: 200,
      title: 'Updated',
      url: 'https://example.com',
    })
    await expect(getUrlRecords()).resolves.toStrictEqual([updated])
  })

  it('同時に複数 URL を upsert しても全レコードを保持する', async () => {
    const state: StorageState = {
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { createOrUpdateUrlRecord } = await loadUrlsModule()

    const [first, second, third] = await Promise.all([
      createOrUpdateUrlRecord('https://example.com/a', 'A'),
      createOrUpdateUrlRecord('https://example.com/b', 'B'),
      createOrUpdateUrlRecord('https://other.example.com/c', 'C'),
    ])

    expect(state.urls).toStrictEqual([first, second, third])
  })

  it('同時 create と delete が URL レコードの更新を失わない', async () => {
    const state: StorageState = {
      customProjects: [],
      savedTabs: [],
      urls: [
        {
          id: 'delete-target',
          savedAt: 1,
          title: 'Delete target',
          url: 'https://example.com/delete-target',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state, {
          cloneReads: true,
          getSetDelayMs: (value) =>
            Array.isArray(value.urls) && value.urls.length === 0 ? 10 : 0,
        }),
      },
    } as unknown as typeof chrome

    const { createOrUpdateUrlRecord, deleteUrlRecord, getUrlRecords } =
      await loadUrlsModule()

    await Promise.all([
      createOrUpdateUrlRecord('https://example.com/new', 'New'),
      deleteUrlRecord('delete-target'),
    ])

    await expect(getUrlRecords()).resolves.toStrictEqual([
      {
        id: 'uuid-1',
        savedAt: expect.any(Number),
        title: 'New',
        url: 'https://example.com/new',
        favIconUrl: undefined,
      },
    ])
  })

  it('一括 upsert で空URLを除外しながら新規作成と更新を行う', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'existing-1',
          savedAt: 1,
          title: 'Old',
          url: 'https://example.com',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { createOrUpdateUrlRecordsBatch, getUrlRecords } =
      await loadUrlsModule()

    vi.spyOn(Date, 'now').mockReturnValue(500)

    const records = await createOrUpdateUrlRecordsBatch([
      {
        title: 'Updated',
        url: ' https://example.com ',
      },
      {
        favIconUrl: 'icon-2',
        title: 'Second',
        url: 'https://second.com',
      },
      {
        title: 'Ignored',
        url: '   ',
      },
    ])

    expect([...records.entries()]).toStrictEqual([
      [
        'https://example.com',
        {
          id: 'existing-1',
          savedAt: 500,
          title: 'Updated',
          url: 'https://example.com',
          favIconUrl: undefined,
        },
      ],
      [
        'https://second.com',
        {
          id: 'uuid-1',
          savedAt: 501,
          title: 'Second',
          url: 'https://second.com',
          favIconUrl: 'icon-2',
        },
      ],
    ])
    await expect(getUrlRecords()).resolves.toStrictEqual([
      {
        id: 'existing-1',
        savedAt: 500,
        title: 'Updated',
        url: 'https://example.com',
        favIconUrl: undefined,
      },
      {
        id: 'uuid-1',
        savedAt: 501,
        title: 'Second',
        url: 'https://second.com',
        favIconUrl: 'icon-2',
      },
    ])
  })

  it('一括 upsert は空URLだけなら保存せず空Mapを返す', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'existing-1',
          savedAt: 1,
          title: 'Existing',
          url: 'https://example.com',
        },
      ],
    }
    const storage = createChromeStorageLocal(state)
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { createOrUpdateUrlRecordsBatch } = await loadUrlsModule()

    const records = await createOrUpdateUrlRecordsBatch([
      {
        title: 'Blank',
        url: '   ',
      },
    ])

    expect([...records.entries()]).toStrictEqual([])
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('インポート用オプションでは重複URLの既存レコードを保持する', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'existing-1',
          savedAt: 1,
          title: 'Existing',
          url: 'https://example.com',
          favIconUrl: 'icon-existing',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      createOrUpdateUrlRecord,
      createOrUpdateUrlRecordsBatch,
      getUrlRecords,
    } = await loadUrlsModule()

    vi.spyOn(Date, 'now').mockReturnValue(500)

    const preserved = await createOrUpdateUrlRecord(
      'https://example.com',
      'Imported',
      'icon-imported',
      {
        preserveExistingOnDuplicate: true,
      },
    )

    expect(preserved).toStrictEqual({
      id: 'existing-1',
      savedAt: 1,
      title: 'Existing',
      url: 'https://example.com',
      favIconUrl: 'icon-existing',
    })

    const records = await createOrUpdateUrlRecordsBatch(
      [
        {
          title: 'Imported',
          url: 'https://example.com',
          favIconUrl: 'icon-imported',
        },
        {
          title: 'Second',
          url: 'https://second.com',
          favIconUrl: 'icon-2',
        },
      ],
      {
        preserveExistingOnDuplicate: true,
      },
    )

    expect([...records.entries()]).toStrictEqual([
      [
        'https://example.com',
        {
          id: 'existing-1',
          savedAt: 1,
          title: 'Existing',
          url: 'https://example.com',
          favIconUrl: 'icon-existing',
        },
      ],
      [
        'https://second.com',
        {
          id: 'uuid-1',
          savedAt: 500,
          title: 'Second',
          url: 'https://second.com',
          favIconUrl: 'icon-2',
        },
      ],
    ])

    await expect(getUrlRecords()).resolves.toStrictEqual([
      {
        id: 'existing-1',
        savedAt: 1,
        title: 'Existing',
        url: 'https://example.com',
        favIconUrl: 'icon-existing',
      },
      {
        id: 'uuid-1',
        savedAt: 500,
        title: 'Second',
        url: 'https://second.com',
        favIconUrl: 'icon-2',
      },
    ])
  })

  it('参照されるURLは削除せず未参照URLだけ削除・クリーンアップする', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urlIds: ['url-2'],
        },
      ],
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'A',
          url: 'https://example.com/a',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'B',
          url: 'https://example.com/b',
        },
        {
          id: 'url-3',
          savedAt: 3,
          title: 'C',
          url: 'https://example.com/c',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      cleanupUnreferencedUrls,
      deleteUrlRecord,
      getUrlRecords,
      isUrlRecordReferenced,
    } = await loadUrlsModule()

    await expect(isUrlRecordReferenced('url-1')).resolves.toBe(true)
    await expect(deleteUrlRecord('url-1')).resolves.toBe(false)
    await expect(deleteUrlRecord('url-3')).resolves.toBe(true)
    await expect(cleanupUnreferencedUrls()).resolves.toBe(0)
    await expect(getUrlRecords()).resolves.toStrictEqual([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com/a',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'B',
        url: 'https://example.com/b',
      },
    ])
  })

  it('存在しないURL削除はfalseを返し、未参照URLのクリーンアップは保存する', async () => {
    const state: StorageState = {
      customProjects: [],
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Referenced',
          url: 'https://example.com/referenced',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Orphan',
          url: 'https://example.com/orphan',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { cleanupUnreferencedUrls, deleteUrlRecord, getUrlRecords } =
      await loadUrlsModule()

    await expect(deleteUrlRecord('missing')).resolves.toBe(false)
    await expect(cleanupUnreferencedUrls()).resolves.toBe(1)
    await expect(getUrlRecords()).resolves.toStrictEqual([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Referenced',
        url: 'https://example.com/referenced',
      },
    ])
  })

  it('未参照URLクリーンアップは urlIds 欠損グループ/プロジェクトを無視する', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-without-urlids',
          name: 'Project',
          updatedAt: 1,
        },
      ],
      savedTabs: [
        {
          domain: 'https://without-urlids.example.com',
          id: 'group-without-urlids',
        },
      ],
      urls: [
        {
          id: 'orphan-id',
          savedAt: 1,
          title: 'Orphan',
          url: 'https://example.com/orphan',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { cleanupUnreferencedUrls } = await loadUrlsModule()

    await expect(cleanupUnreferencedUrls()).resolves.toBe(1)
    expect(state.urls).toStrictEqual([])
  })

  it('重複URLを新しいレコードへ統合し参照先を更新する', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urlIds: ['old-id'],
        },
      ],
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
          urlIds: ['old-id'],
        },
      ],
      urls: [
        {
          id: 'old-id',
          savedAt: 10,
          title: 'Old',
          url: 'https://example.com',
        },
        {
          id: 'new-id',
          savedAt: 20,
          title: 'New',
          url: 'https://example.com',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deduplicateUrlRecords } = await loadUrlsModule()

    await expect(deduplicateUrlRecords()).resolves.toBe(1)
    expect(state.urls).toStrictEqual([
      {
        id: 'new-id',
        savedAt: 20,
        title: 'New',
        url: 'https://example.com',
      },
    ])
    expect(state.savedTabs?.[0].urlIds).toStrictEqual(['new-id'])
    expect(state.customProjects?.[0].urlIds).toStrictEqual(['new-id'])
  })

  it('重複URLがなければ統合保存しない', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://example.com/one',
        },
      ],
    }
    const storage = createChromeStorageLocal(state)
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { deduplicateUrlRecords } = await loadUrlsModule()

    await expect(deduplicateUrlRecords()).resolves.toBe(0)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('重複URLは古いレコードを削除対象にし、参照更新エラー後も統合を続ける', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urlIds: ['duplicate-id'],
        },
      ],
      savedTabs: [
        {
          domain: 'https://example.com',
          id: 'group-1',
          urlIds: ['duplicate-id'],
        },
      ],
      urls: [
        {
          id: 'keeper-id',
          savedAt: 20,
          title: 'Keeper',
          url: 'https://example.com',
        },
        {
          id: 'duplicate-id',
          savedAt: 10,
          title: 'Duplicate',
          url: 'https://example.com',
        },
      ],
    }
    const storage = createChromeStorageLocal(state)
    storage.set.mockRejectedValueOnce(new Error('tabs update failed'))
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { deduplicateUrlRecords } = await loadUrlsModule()

    await expect(deduplicateUrlRecords()).resolves.toBe(1)
    expect(state.urls).toStrictEqual([
      {
        id: 'keeper-id',
        savedAt: 20,
        title: 'Keeper',
        url: 'https://example.com',
      },
    ])
  })

  it('URL保存失敗は呼び出し元へ再throwし、重複統合では0件として扱う', async () => {
    const storage = createChromeStorageLocal({
      urls: [
        {
          id: 'old-id',
          savedAt: 10,
          title: 'Old',
          url: 'https://example.com',
        },
        {
          id: 'new-id',
          savedAt: 20,
          title: 'New',
          url: 'https://example.com',
        },
      ],
    })
    storage.set.mockRejectedValue(new Error('save failed'))
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { deduplicateUrlRecords, saveUrlRecords } = await loadUrlsModule()

    await expect(saveUrlRecords([])).rejects.toThrow('save failed')
    await expect(deduplicateUrlRecords()).resolves.toBe(0)
  })

  it('検索 miss と既存 URL 更新時の非対象レコードを扱う', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Two',
          url: 'https://docs.example.com/two',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { createOrUpdateUrlRecord, findUrlRecordByUrl, getUrlRecordById } =
      await loadUrlsModule()

    await expect(getUrlRecordById('missing')).resolves.toBeNull()
    await expect(
      findUrlRecordByUrl('https://docs.example.com/missing'),
    ).resolves.toBeNull()
    await expect(
      createOrUpdateUrlRecord('https://docs.example.com/one', 'Updated'),
    ).resolves.toStrictEqual(
      expect.objectContaining({
        id: 'url-1',
        title: 'Updated',
      }),
    )
    expect(state.urls).toStrictEqual([
      expect.objectContaining({
        id: 'url-1',
        title: 'Updated',
      }),
      expect.objectContaining({
        id: 'url-2',
        title: 'Two',
      }),
    ])
  })

  it('参照チェックと参照更新は urlIds 欠損と replacement fallback を扱う', async () => {
    const state: StorageState = {
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
        },
        {
          categories: [],
          createdAt: 1,
          id: 'project-2',
          name: 'Project 2',
          updatedAt: 1,
          urlIds: ['duplicate-id', 'unmapped-duplicate-id', 'keep-id'],
          urlMetadata: {
            'duplicate-id': {
              category: 'Reading',
              notes: 'duplicate memo',
            },
            'keep-id': {
              category: 'Keep',
            },
            'unmapped-duplicate-id': {
              category: 'Unmapped',
            },
          },
        },
      ],
      savedTabs: [
        {
          domain: 'docs.example.com',
          id: 'group-1',
        },
        {
          domain: 'news.example.com',
          id: 'group-2',
          urlIds: ['duplicate-id', 'unmapped-duplicate-id', 'keep-id'],
          urlSubCategories: {
            'duplicate-id': 'News',
            'keep-id': 'Keep',
            'unmapped-duplicate-id': 'Unmapped',
          },
        },
      ],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { isUrlRecordReferenced, updateUrlReferences } =
      await loadUrlsModule()

    await expect(isUrlRecordReferenced('missing')).resolves.toBe(false)
    await updateUrlReferences(
      ['duplicate-id', 'unmapped-duplicate-id'],
      new Map([['duplicate-id', 'replacement-id']]),
    )
    await updateUrlReferences(['missing-duplicate-id'], new Map())

    expect(state.savedTabs?.[0]).toStrictEqual(
      expect.objectContaining({
        id: 'group-1',
      }),
    )
    expect(state.savedTabs?.[1]?.urlIds).toStrictEqual([
      'replacement-id',
      'unmapped-duplicate-id',
      'keep-id',
    ])
    expect(state.savedTabs?.[1]?.urlSubCategories).toStrictEqual({
      'keep-id': 'Keep',
      'replacement-id': 'News',
      'unmapped-duplicate-id': 'Unmapped',
    })
    expect(state.customProjects?.[0]).toStrictEqual(
      expect.objectContaining({
        id: 'project-1',
      }),
    )
    expect(state.customProjects?.[1]?.urlIds).toStrictEqual([
      'replacement-id',
      'unmapped-duplicate-id',
      'keep-id',
    ])
    expect(state.customProjects?.[1]?.urlMetadata).toStrictEqual({
      'keep-id': {
        category: 'Keep',
      },
      'replacement-id': {
        category: 'Reading',
        notes: 'duplicate memo',
      },
      'unmapped-duplicate-id': {
        category: 'Unmapped',
      },
    })
  })

  it('ストレージエラー時は安全側に倒す', async () => {
    const storage = createChromeStorageLocal({
      urls: 'broken',
    })
    storage.get.mockRejectedValue(new Error('boom'))
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const { cleanupUnreferencedUrls, getUrlRecords, isUrlRecordReferenced } =
      await loadUrlsModule()

    await expect(getUrlRecords()).resolves.toStrictEqual([])
    await expect(isUrlRecordReferenced('any')).resolves.toBe(true)
    await expect(cleanupUnreferencedUrls()).resolves.toBe(0)
  })
})

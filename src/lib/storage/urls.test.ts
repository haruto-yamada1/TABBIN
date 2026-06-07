import { beforeEach, describe, expect, it, vi } from 'vitest'

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

interface StorageState {
  customProjects?: CustomProject[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[] | unknown
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

const loadUrlsModule = async () => {
  vi.resetModules()
  return import('./urls')
}

describe('urls storage', () => {
  beforeEach(() => {
    mocks.resetUuid()
    vi.restoreAllMocks()
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

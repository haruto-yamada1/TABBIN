/* eslint-disable typescript/no-misused-promises, typescript/require-await, typescript/unbound-method -- chrome.storage.local.get の mock 実装が interface シグネチャに async を要求し、かつ同期分岐を持つテスト idiom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: vi.fn(),
}))

vi.mock('@/lib/storage/projects', () => ({
  removeUrlFromAllCustomProjects: vi.fn(),
}))

vi.mock('@/lib/storage/urls', () => ({
  deleteUrlRecord: vi.fn(),
  invalidateUrlCache: vi.fn(),
}))

import { removeUrlFromAllCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
import { deleteUrlRecord, invalidateUrlCache } from '@/lib/storage/urls'

import {
  clearDraggedUrlInfo,
  getDraggedUrlInfo,
  handleTabCreated,
  handleUrlDragStarted,
  handleUrlDropped,
  normalizeUrl,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  setDraggedUrlInfo,
} from './url-storage'

const createSettings = (overrides: Record<string, unknown> = {}) =>
  ({
    removeTabAfterOpen: true,
    removeTabAfterExternalDrop: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
    enableCategories: true,
    autoDeletePeriod: 'never',
    showSavedTime: false,
    clickBehavior: 'saveSameDomainTabs',
    excludePinnedTabs: true,
    openUrlInBackground: true,
    openAllInNewWindow: false,
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    colors: {},
    ...overrides,
  }) as Awaited<ReturnType<typeof getUserSettings>>

interface StorageState {
  customProjects?: {
    id: string
    name: string
    urlIds?: string[]
    urlMetadata?: Record<string, { category?: string; notes?: string }>
    categories: string[]
    createdAt: number
    updatedAt: number
  }[]
  savedTabs?: {
    id: string
    domain: string
    parentCategoryId?: string
    urls?: { url: string; title: string }[]
    urlIds?: string[]
    urlSubCategories?: Record<string, string>
  }[]
  parentCategories: unknown[]
  urls?: {
    id: string
    url: string
    title: string
    savedAt: number
  }[]
}

interface ChromeMockOptions {
  cloneReads?: boolean
  rejectGet?: boolean
  rejectSet?: boolean
}

let storageState: StorageState

const setupChromeMock = (options: ChromeMockOptions = {}) => {
  const readValue = <T>(value: T): T =>
    options.cloneReads ? structuredClone(value) : value

  const getMock = vi.fn(async (keys?: unknown) => {
    if (options.rejectGet) {
      throw new Error('storage get failed')
    }

    if (typeof (keys as unknown as string) === 'string') {
      return {
        [keys as string]: readValue(storageState[keys as keyof StorageState]),
      }
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(
        keys.map((key) => [
          key,
          readValue(storageState[key as keyof StorageState]),
        ]),
      )
    }

    if (keys && typeof (keys as unknown as string) === 'object') {
      const defaults = keys as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(defaults).map(([key, fallback]) => [
          key,
          key in storageState
            ? readValue(storageState[key as keyof StorageState])
            : readValue(fallback),
        ]),
      )
    }

    return readValue({ ...storageState })
  })

  const setMock = vi.fn(async (next: Record<string, unknown>) => {
    if (options.rejectSet) {
      throw new Error('storage set failed')
    }
    Object.assign(storageState, next)
  })

  ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
    storage: {
      local: {
        get: getMock,
        set: setMock,
      },
    },
  } as unknown as typeof chrome
}

describe('url-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearDraggedUrlInfo()

    storageState = {
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [
            { url: 'https://example.com', title: 'Example' },
            { url: 'https://example.org', title: 'Other' },
          ],
        },
      ],
      parentCategories: [],
      urls: [],
    }
    setupChromeMock()
  })

  afterEach(() => {
    clearDraggedUrlInfo()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('外部ドロップでも専用設定がOFFなら削除をスキップする', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      createSettings({
        removeTabAfterExternalDrop: false,
      }),
    )

    const result = await handleUrlDropped('https://example.com', true)

    expect(result).toBe('skipped')

    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it('ユーザーURLのhost・path・queryをログへ出力しない', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      createSettings({ removeTabAfterExternalDrop: false }),
    )
    const privateUrl =
      'https://private.example.com/account/settings?token=top-secret'

    await handleUrlDropped(privateUrl, true)

    const loggedValues = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(loggedValues).toContain('[redacted-url]')
    expect(loggedValues).not.toContain('private.example.com')
    expect(loggedValues).not.toContain('/account/settings')
    expect(loggedValues).not.toContain('top-secret')
  })

  it('外部ドロップかつ専用設定がONならURLを削除する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())

    const result = await handleUrlDropped('https://example.com', true)

    expect(result).toBe('removed')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.org', title: 'Other' }],
        },
      ],
    })
  })

  it('内部操作時は internal_operation を返す', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())

    const result = await handleUrlDropped('https://example.com', false)

    expect(result).toBe('internal_operation')
  })

  it('外部ドロップ削除でエラーが出たら再スローする', async () => {
    setupChromeMock({ rejectGet: true })
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())

    await expect(handleUrlDropped('https://example.com', true)).rejects.toThrow(
      'storage get failed',
    )
  })

  it('ドラッグ開始で情報を保持し、タイムアウトで自動クリアする', () => {
    vi.useFakeTimers()

    handleUrlDragStarted('https://example.com/page')
    const info = getDraggedUrlInfo()
    expect(info?.url).toBe('https://example.com/page')
    expect(info?.processed).toBe(false)
    expect(info?.timeoutId).toBeDefined()

    vi.advanceTimersByTime(10000)

    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('古いドラッグのタイムアウトで新しいドラッグ情報を消さない', () => {
    vi.useFakeTimers()

    handleUrlDragStarted('https://first.example.com')
    vi.advanceTimersByTime(5_000)
    handleUrlDragStarted('https://second.example.com')
    vi.advanceTimersByTime(5_000)

    expect(getDraggedUrlInfo()?.url).toBe('https://second.example.com')

    vi.advanceTimersByTime(5_000)
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('新規タブURLが一致し removeTabAfterOpen=true ならURLを削除する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      createSettings({ removeTabAfterOpen: true }),
    )
    handleUrlDragStarted('https://example.com')

    await handleTabCreated({
      url: 'https://example.com#hash',
    } as chrome.tabs.Tab)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.org', title: 'Other' }],
        },
      ],
    })
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('新規タブURLが一致しても removeTabAfterOpen=false なら削除しない', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(
      createSettings({ removeTabAfterOpen: false }),
    )
    handleUrlDragStarted('https://example.com/path?query=1')

    await handleTabCreated({
      url: 'https://example.com/path',
    } as chrome.tabs.Tab)

    expect(chrome.storage.local.set).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('新規タブURLが一致しない場合はドラッグ情報を保持する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())
    handleUrlDragStarted('https://example.com/path')

    await handleTabCreated({
      url: 'https://another.example.com',
    } as chrome.tabs.Tab)

    expect(getDraggedUrlInfo()?.url).toBe('https://example.com/path')
  })

  it('新規タブ処理で削除に失敗しても最終的にドラッグ情報をクリアする', async () => {
    setupChromeMock({ rejectSet: true })
    vi.mocked(getUserSettings).mockResolvedValue(
      createSettings({ removeTabAfterOpen: true }),
    )
    handleUrlDragStarted('https://example.com/path')

    await expect(
      handleTabCreated({
        url: 'https://example.com/path',
      } as chrome.tabs.Tab),
    ).resolves.toBeUndefined()

    expect(getDraggedUrlInfo()).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('set/get/clear でドラッグ情報を管理できる', () => {
    const info = {
      url: 'https://example.com/item',
      timestamp: 1000,
      processed: false,
    }
    setDraggedUrlInfo(info)

    expect(getDraggedUrlInfo()).toStrictEqual(info)

    clearDraggedUrlInfo()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('normalizeUrl は trim 失敗時にフォールバック値を返す', () => {
    const malformed = {
      trim() {
        throw new Error('trim failed')
      },
      toLowerCase() {
        return 'fallback-url'
      },
    } as unknown as string

    expect(normalizeUrl(malformed)).toBe('fallback-url')
  })

  it('URL削除でグループが空になったとき parentCategories からIDを外す', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-empty',
          domain: 'example.com',
          parentCategoryId: 'cat-parent',
          urls: [{ url: 'https://single.example.com', title: 'Single' }],
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-empty', 'group-keep'],
          domainNames: ['example.com'],
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://single.example.com')
    await Promise.resolve()
    await Promise.resolve()

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ savedTabs: [] })

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-keep'],
          domainNames: ['example.com'],
        },
      ],
    })
  })

  it('同じURLで複数グループが空になっても全IDを親カテゴリから外す', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-empty-1',
          domain: 'first.example.com',
          urls: [{ url: 'https://shared.example.com', title: 'Shared' }],
        },
        {
          id: 'group-empty-2',
          domain: 'second.example.com',
          urls: [{ url: 'https://shared.example.com', title: 'Shared' }],
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-empty-1', 'group-empty-2', 'group-keep'],
          domainNames: ['first.example.com', 'second.example.com'],
        },
      ],
    }
    setupChromeMock({ cloneReads: true })

    await removeUrlFromStorage('https://shared.example.com')

    expect(storageState.savedTabs).toStrictEqual([])
    expect(storageState.parentCategories).toStrictEqual([
      {
        id: 'cat-1',
        name: 'Category 1',
        domains: ['group-keep'],
        domainNames: ['first.example.com', 'second.example.com'],
      },
    ])
  })

  it('グループのドメイン情報が欠損しているときカテゴリ更新をスキップする', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-empty',
          domain: '',
          urls: [{ url: 'https://single.example.com', title: 'Single' }],
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-empty'],
          domainNames: ['example.com'],
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://single.example.com')
    await Promise.resolve()

    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
      parentCategories: expect.anything(),
    })
  })

  it('parentCategories 更新時に例外が起きても削除処理は継続する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-empty',
          domain: 'example.com',
          urls: [{ url: 'https://single.example.com', title: 'Single' }],
        },
      ],
      parentCategories: [],
    }
    setupChromeMock()

    vi.mocked(chrome.storage.local.get).mockImplementation(
      // eslint-disable-line
      // eslint-disable-line
      // eslint-disable-line
      async (key: unknown) => {
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        if (Array.isArray(key)) {
          return {
            savedTabs: storageState.savedTabs,
            urls: storageState.urls,
          }
        }
        if (key === 'savedTabs') {
          return { savedTabs: storageState.savedTabs }
        }
        if (key === 'parentCategories') {
          throw new Error('parent category read failed')
        }
        return {}
      },
    )

    await expect(
      removeUrlFromStorage('https://single.example.com'),
    ).resolves.toBeUndefined()
    await Promise.resolve()

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ savedTabs: [] })
    expect(console.error).toHaveBeenCalledWith(
      '親カテゴリからの削除中にエラーが発生しました:',
      'parent category read failed',
    )
  })

  it('保存先更新で失敗した場合は removeUrlFromStorage がエラーを再スローする', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.com', title: 'Example' }],
        },
      ],
      parentCategories: [],
    }
    setupChromeMock({ rejectSet: true })

    await expect(removeUrlFromStorage('https://example.com')).rejects.toThrow(
      'storage set failed',
    )
  })

  it('savedTabs が未定義でも空配列として保存する', async () => {
    storageState = {
      parentCategories: [],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://example.com')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ savedTabs: [] })
  })

  it('urls/urlIds 未定義グループは保持し、カテゴリ更新を行わない', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-no-urls',
          domain: 'no-urls.example.com',
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-no-urls'],
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://does-not-exist.example.com')
    await Promise.resolve()

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-no-urls',
          domain: 'no-urls.example.com',
        },
      ],
    })

    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
      parentCategories: expect.anything(),
    })
  })

  it('domainNames に対象ドメインがない場合の分岐を通る', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-with-domainnames',
          domain: 'target.example.com',
          urls: [{ url: 'https://target.example.com', title: 'Target' }],
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-with-domainnames'],
          domainNames: ['another.example.com'],
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com')
    await Promise.resolve()

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: [],
          domainNames: ['another.example.com'],
        },
      ],
    })
  })

  it('parentCategories/savedTabs が欠損していてもカテゴリ削除処理が継続する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-fallback',
          domain: 'fallback.example.com',
          urls: [{ url: 'https://fallback.example.com', title: 'Fallback' }],
        },
      ],
      parentCategories: [],
    }
    setupChromeMock()

    let callCount = 0

    vi.mocked(chrome.storage.local.get).mockImplementation(
      // eslint-disable-line
      // eslint-disable-line
      // eslint-disable-line
      async (key: unknown) => {
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        callCount += 1
        if (callCount === 1 && key === 'savedTabs') {
          return { savedTabs: storageState.savedTabs }
        }
        return {}
      },
    )

    await expect(
      removeUrlFromStorage('https://fallback.example.com'),
    ).resolves.toBeUndefined()
  })

  it('removeFromParentCategories で非Error例外が発生しても処理を継続する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-non-error',
          domain: 'non-error.example.com',
          urls: [{ url: 'https://non-error.example.com', title: 'NonError' }],
        },
      ],
      parentCategories: [],
    }
    setupChromeMock()

    vi.mocked(chrome.storage.local.get).mockImplementation(
      // eslint-disable-line
      // eslint-disable-line
      // eslint-disable-line
      async (key: unknown) => {
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        if (Array.isArray(key)) {
          return {
            savedTabs: storageState.savedTabs,
            urls: storageState.urls,
          }
        }
        if (key === 'savedTabs') {
          return { savedTabs: storageState.savedTabs }
        }
        if (key === 'parentCategories') {
          // eslint-disable-next-line eslint/no-throw-literal
          throw 'non-error-thrown' // eslint-disable-line
        }
        return {}
      },
    )

    await removeUrlFromStorage('https://non-error.example.com')
    await Promise.resolve()

    expect(console.error).toHaveBeenCalledWith(
      '親カテゴリからの削除中にエラーが発生しました:',
      'non-error-thrown',
    )
  })

  it('ドラッグ情報が処理済みならタイムアウトしてもクリアしない', () => {
    vi.useFakeTimers()
    handleUrlDragStarted('https://keep.example.com')

    const info = getDraggedUrlInfo()
    if (!info) {
      throw new Error('dragged info should exist')
    }
    info.processed = true

    vi.advanceTimersByTime(10000)
    expect(getDraggedUrlInfo()?.url).toBe('https://keep.example.com')
  })

  it('setTimeoutコールバック即時実行時は timeoutId を設定しない分岐を通る', () => {
    using _setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((
        callback: TimerHandler,
        _delay?: number,
        ...args: unknown[]
      ) => {
        if (callback instanceof Function) {
          callback(...args)
        }
        return 1 as unknown as ReturnType<typeof setTimeout>
      }) as unknown as typeof setTimeout)

    handleUrlDragStarted('https://instant.example.com')

    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('ドラッグ情報がない状態の handleTabCreated は何もしない', async () => {
    clearDraggedUrlInfo()
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())

    await handleTabCreated({ url: 'https://example.com' } as chrome.tabs.Tab)

    expect(getUserSettings).not.toHaveBeenCalled()
  })

  it('tab.url が undefined の場合は比較失敗として扱う', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(createSettings())
    handleUrlDragStarted('https://example.com/path')

    await handleTabCreated({} as chrome.tabs.Tab)

    expect(getDraggedUrlInfo()?.url).toBe('https://example.com/path')
  })

  it('urlIdsベースの保存データでは対象URLのみ削除し、他グループは保持する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1'],
          urlSubCategories: { 'url-id-1': 'catA' },
        },
        {
          id: 'group-other',
          domain: 'other.example.com',
          urlIds: ['url-id-2'],
          urlSubCategories: { 'url-id-2': 'catB' },
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://target.example.com/page',
          title: 'Target',
          savedAt: 1,
        },
        {
          id: 'url-id-2',
          url: 'https://other.example.com/page',
          title: 'Other',
          savedAt: 2,
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com/page')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-other',
          domain: 'other.example.com',
          urlIds: ['url-id-2'],
          urlSubCategories: { 'url-id-2': 'catB' },
        },
      ],
    })
  })

  it('urlIdsベース削除ではカスタムプロジェクト同期後に未参照URLレコードも削除する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1'],
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://target.example.com/page',
          title: 'Target',
          savedAt: 1,
        },
      ],
    }
    setupChromeMock()
    vi.mocked(deleteUrlRecord).mockResolvedValue(true)

    await removeUrlFromStorage('https://target.example.com/page')

    expect(removeUrlFromAllCustomProjects).toHaveBeenCalledWith(
      'https://target.example.com/page',
    )
    expect(deleteUrlRecord).toHaveBeenCalledWith('url-id-1')
  })

  it('urlIdsベースで対象URLを削除しても他URLが残る場合はグループを維持する', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1', 'url-id-3'],
          urlSubCategories: {
            'url-id-1': 'catA',
            'url-id-3': 'catC',
          },
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://target.example.com/page',
          title: 'Target',
          savedAt: 1,
        },
        {
          id: 'url-id-3',
          url: 'https://target.example.com/keep',
          title: 'Keep',
          savedAt: 3,
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com/page')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-3'],
          urlSubCategories: {
            'url-id-3': 'catC',
          },
        },
      ],
    })
  })

  it('urlSubCategories が対象URLのみの場合は削除後に undefined になる', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1', 'url-id-2'],
          urlSubCategories: {
            'url-id-1': 'catA',
          },
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://target.example.com/page',
          title: 'Target',
          savedAt: 1,
        },
        {
          id: 'url-id-2',
          url: 'https://target.example.com/keep',
          title: 'Keep',
          savedAt: 2,
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com/page')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-2'],
          urlSubCategories: undefined,
        },
      ],
    })
  })

  it('urlIds削除でurlSubCategoriesが未定義でも削除できる', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1', 'url-id-2'],
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://target.example.com/page',
          title: 'Target',
          savedAt: 1,
        },
        {
          id: 'url-id-2',
          url: 'https://target.example.com/keep',
          title: 'Keep',
          savedAt: 2,
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com/page')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-2'],
          urlSubCategories: undefined,
        },
      ],
    })
  })

  it('urlIds形式でURLレコードが未解決の場合はグループを変更しない', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1'],
          urlSubCategories: { 'url-id-1': 'catA' },
        },
      ],
      parentCategories: [],
      urls: [
        {
          id: 'url-id-1',
          url: 'https://another.example.com/page',
          title: 'Another',
          savedAt: 1,
        },
      ],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://target.example.com/page')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-target',
          domain: 'target.example.com',
          urlIds: ['url-id-1'],
          urlSubCategories: { 'url-id-1': 'catA' },
        },
      ],
    })
  })

  it('カテゴリ削除処理で parentCategories/savedTabs 未定義でもフォールバックする', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-empty',
          domain: 'fallback.example.com',
          urls: [{ url: 'https://fallback.example.com', title: 'Fallback' }],
        },
      ],
      parentCategories: [],
      urls: [],
    }
    setupChromeMock()

    vi.mocked(chrome.storage.local.get).mockImplementation(
      // eslint-disable-line
      // eslint-disable-line
      // eslint-disable-line
      async (key: unknown) => {
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        // eslint-disable-line
        if (Array.isArray(key)) {
          return {
            savedTabs: storageState.savedTabs,
            urls: storageState.urls,
          }
        }
        if (key === 'parentCategories') {
          return {}
        }
        if (key === 'savedTabs') {
          return {}
        }
        return {}
      },
    )

    await removeUrlFromStorage('https://fallback.example.com')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ savedTabs: [] })
  })

  it('category.domainNames が配列でない場合でもカテゴリ更新できる', async () => {
    storageState = {
      savedTabs: [
        {
          id: 'group-domainnames-non-array',
          domain: 'domainnames.example.com',
          urls: [
            { url: 'https://domainnames.example.com', title: 'DomainNames' },
          ],
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-domainnames-non-array'],
          domainNames: 'not-array',
        } as unknown,
      ],
      urls: [],
    }
    setupChromeMock()

    await removeUrlFromStorage('https://domainnames.example.com')

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: [],
          domainNames: 'not-array',
        },
      ],
    })
  })

  it('複数URL IDを一括削除して保存タブ・プロジェクト・カテゴリ・URLレコードを1回で更新する', async () => {
    storageState = {
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-1', 'url-2', 'url-3'],
          urlMetadata: {
            'url-1': { category: 'Read' },
            'url-2': { notes: 'remove me' },
            'url-3': { category: 'Keep' },
          },
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-empty', 'group-keep'],
          domainNames: ['empty.example.com', 'keep.example.com'],
        },
      ],
      savedTabs: [
        {
          id: 'group-empty',
          domain: 'empty.example.com',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: {
            'url-1': 'Docs',
            'url-2': 'Docs',
          },
        },
        {
          id: 'group-keep',
          domain: 'keep.example.com',
          urlIds: ['url-2', 'url-3'],
          urlSubCategories: {
            'url-2': 'Docs',
            'url-3': 'Keep',
          },
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Delete 1',
          url: 'https://empty.example.com/1',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Delete 2',
          url: 'https://empty.example.com/2',
        },
        {
          id: 'url-3',
          savedAt: 3,
          title: 'Keep',
          url: 'https://keep.example.com/3',
        },
      ],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['url-1', 'url-2'])

    expect(removedCount).toBe(2)

    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1)

    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      'savedTabs',
      'urls',
      'customProjects',
      'parentCategories',
    ])

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-3'],
          urlMetadata: {
            'url-3': { category: 'Keep' },
          },
          categories: [],
          createdAt: 1,
          updatedAt: expect.any(Number),
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: ['group-keep'],
          domainNames: ['empty.example.com', 'keep.example.com'],
        },
      ],
      savedTabs: [
        {
          id: 'group-keep',
          domain: 'keep.example.com',
          urlIds: ['url-3'],
          urlSubCategories: {
            'url-3': 'Keep',
          },
        },
      ],
      urls: [
        {
          id: 'url-3',
          savedAt: 3,
          title: 'Keep',
          url: 'https://keep.example.com/3',
        },
      ],
    })
    expect(invalidateUrlCache).toHaveBeenCalledTimes(1)
  })

  it('一括削除は空IDだけならストレージを読まず0件を返す', async () => {
    const removedCount = await removeUrlRecordsFromStorage([''])

    expect(removedCount).toBe(0)

    expect(chrome.storage.local.get).not.toHaveBeenCalled()
  })

  it('一括削除はストレージ値が配列でない場合は空配列として扱う', async () => {
    storageState = {
      customProjects: 'invalid' as unknown as StorageState['customProjects'],
      parentCategories:
        'invalid' as unknown as StorageState['parentCategories'],
      savedTabs: 'invalid' as unknown as StorageState['savedTabs'],
      urls: 'invalid' as unknown as StorageState['urls'],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['url-1'])

    expect(removedCount).toBe(0)

    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it('一括削除は subCategory 変更がないグループの metadata を保持する', async () => {
    storageState = {
      customProjects: [
        {
          id: 'project-invalid-urlids',
          name: 'Invalid URL IDs',
          urlIds: 'invalid' as unknown as string[],
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-keep-metadata',
          domain: 'keep.example.com',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: {
            'url-2': 'Keep',
          },
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Delete',
          url: 'https://keep.example.com/delete',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Keep',
          url: 'https://keep.example.com/keep',
        },
      ],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['url-1'])

    expect(removedCount).toBe(1)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-keep-metadata',
          domain: 'keep.example.com',
          urlIds: ['url-2'],
          urlSubCategories: {
            'url-2': 'Keep',
          },
        },
      ],
      urls: [
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Keep',
          url: 'https://keep.example.com/keep',
        },
      ],
    })
  })

  it('一括削除は urlIds がないグループと domains が配列でないカテゴリを保持する', async () => {
    storageState = {
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { notes: 'remove all metadata' },
          },
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Category 1',
          domains: 'not-array',
        },
        {
          id: 'cat-2',
          name: 'Category 2',
          domains: ['other-group'],
        },
      ],
      savedTabs: [
        {
          id: 'group-without-ids',
          domain: 'without-ids.example.com',
        },
        {
          id: 'group-empty',
          domain: 'empty.example.com',
          urlIds: ['url-1'],
          urlSubCategories: {
            'url-1': 'Docs',
          },
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Delete',
          url: 'https://empty.example.com/1',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Keep',
          url: 'https://project.example.com/2',
        },
      ],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['url-1'])

    expect(removedCount).toBe(1)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-2'],
          urlMetadata: undefined,
          categories: [],
          createdAt: 1,
          updatedAt: expect.any(Number),
        },
      ],
      savedTabs: [
        {
          id: 'group-without-ids',
          domain: 'without-ids.example.com',
        },
      ],
      urls: [
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Keep',
          url: 'https://project.example.com/2',
        },
      ],
    })
  })

  it('存在しないURL IDの一括削除では保存先を更新しない', async () => {
    storageState = {
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-1'],
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Keep',
          url: 'https://example.com',
        },
      ],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['missing-url'])

    expect(removedCount).toBe(0)

    expect(chrome.storage.local.set).not.toHaveBeenCalled()
    expect(invalidateUrlCache).not.toHaveBeenCalled()
  })

  it('一括削除はURLレコードがなく参照だけ消える場合はキャッシュを無効化しない', async () => {
    storageState = {
      customProjects: [],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urlIds: ['stale-url', 'url-keep'],
        },
      ],
      urls: [
        {
          id: 'url-keep',
          savedAt: 1,
          title: 'Keep',
          url: 'https://example.com/keep',
        },
      ],
    }
    setupChromeMock()

    const removedCount = await removeUrlRecordsFromStorage(['stale-url'])

    expect(removedCount).toBe(0)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urlIds: ['url-keep'],
        },
      ],
    })
    expect(invalidateUrlCache).not.toHaveBeenCalled()
  })

  it('一括削除のストレージ更新失敗は再スローする', async () => {
    storageState = {
      customProjects: [],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'example.com',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Delete',
          url: 'https://example.com',
        },
      ],
    }
    setupChromeMock({ rejectSet: true })

    await expect(removeUrlRecordsFromStorage(['url-1'])).rejects.toThrow(
      'storage set failed',
    )
  })
})

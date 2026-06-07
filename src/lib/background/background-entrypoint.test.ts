import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  setupExpiredTabsCheckAlarm: vi.fn(),
  createContextMenus: vi.fn(),
  handleExtensionActionClick: vi.fn(),
  setupMessageListener: vi.fn(),
  openSavedTabsPage: vi.fn(),
  handleTabCreated: vi.fn(),
  getParentCategories: vi.fn(),
  migrateParentCategoriesToDomainNames: vi.fn(),
}))
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (setup: () => void) => {
    setup()
    return {}
  },
}))
vi.mock('@/lib/background/alarm-notification', () => ({
  setupExpiredTabsCheckAlarm: mocked.setupExpiredTabsCheckAlarm,
}))
vi.mock('@/lib/background/context-menu', () => ({
  createContextMenus: mocked.createContextMenus,
}))
vi.mock('@/lib/background/extension-actions', () => ({
  handleExtensionActionClick: mocked.handleExtensionActionClick,
}))
vi.mock('@/lib/background/message-handler', () => ({
  setupMessageListener: mocked.setupMessageListener,
}))
vi.mock('@/lib/background/saved-tabs-page', () => ({
  openSavedTabsPage: mocked.openSavedTabsPage,
}))
vi.mock('@/lib/background/url-storage', () => ({
  handleTabCreated: mocked.handleTabCreated,
}))
vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: mocked.getParentCategories,
}))
vi.mock('@/lib/storage/migration', () => ({
  migrateParentCategoriesToDomainNames:
    mocked.migrateParentCategoriesToDomainNames,
}))
type InstalledListener = (details: {
  reason: 'install' | 'update' | 'chrome_update'
}) => void | Promise<void>
type StartupListener = () => void | Promise<void>
interface ChromeHarness {
  onInstalledListeners: InstalledListener[]
  onStartupListeners: StartupListener[]
  storageSet: ReturnType<typeof vi.fn>
  storageGet: ReturnType<typeof vi.fn>
  tabsCreate: ReturnType<typeof vi.fn>
  actionAddListener: ReturnType<typeof vi.fn>
  tabsOnCreatedAddListener: ReturnType<typeof vi.fn>
}
const createChromeHarness = (
  initialStorage: Record<string, unknown> = {},
): ChromeHarness => {
  const storage = {
    ...initialStorage,
  }
  const onInstalledListeners: InstalledListener[] = []
  const onStartupListeners: StartupListener[] = []
// eslint-disable-next-line typescript/require-await
  const storageGet = vi.fn(async (keys?: unknown) => {
    if (keys == null) {
      return {
        ...storage,
      }
    }
    if (typeof keys === 'string') {
      return {
        [keys]: storage[keys],
      }
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storage[key]]))
    }
    if (typeof keys === 'object') {
      const defaults = keys as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const [key, fallback] of Object.entries(defaults)) {
        result[key] = key in storage ? storage[key] : fallback
      }
      return result
    }
    return {}
  })
// eslint-disable-next-line typescript/require-await
  const storageSet = vi.fn(async (next: Record<string, unknown>) => {
    Object.assign(storage, next)
  })
  const tabsCreate = vi.fn(
// eslint-disable-next-line typescript/require-await
    async (createProperties: chrome.tabs.CreateProperties) => ({
      id: 100,
      ...createProperties,
    }),
  )
  const actionAddListener = vi.fn()
  const tabsOnCreatedAddListener = vi.fn()
  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = {
    runtime: {
      getManifest: vi.fn(() => ({
        version: '9.9.9',
      })),
      getURL: vi.fn((path: string) => `chrome-extension://tabbin/${path}`),
      onInstalled: {
        addListener: vi.fn((listener: InstalledListener) => {
          onInstalledListeners.push(listener)
        }),
      },
      onStartup: {
        addListener: vi.fn((listener: StartupListener) => {
          onStartupListeners.push(listener)
        }),
      },
    },
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
    tabs: {
      create: tabsCreate,
      update: vi.fn(),
// eslint-disable-next-line typescript/require-await
      query: vi.fn(async () => []),
      get: vi.fn(),
      remove: vi.fn(),
      onCreated: {
        addListener: tabsOnCreatedAddListener,
      },
    },
    action: {
      onClicked: {
        addListener: actionAddListener,
      },
    },
  } as unknown as typeof chrome
  return {
    onInstalledListeners,
    onStartupListeners,
    storageSet,
    storageGet,
    tabsCreate,
    actionAddListener,
    tabsOnCreatedAddListener,
  }
}
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
interface LoadBackgroundOptions {
  initialStorage?: Record<string, unknown>
  clearAfterImport?: boolean
  setupMocks?: () => void
  dev?: boolean
}
const loadBackground = async (
  options: LoadBackgroundOptions = {},
): Promise<ChromeHarness> => {
  vi.resetModules()
  vi.clearAllMocks()
  if (options.dev !== undefined) {
    vi.stubEnv('DEV', options.dev)
  }
  mocked.openSavedTabsPage.mockResolvedValue(123)
  mocked.getParentCategories.mockResolvedValue([])
  mocked.migrateParentCategoriesToDomainNames.mockResolvedValue(undefined)
  mocked.createContextMenus.mockImplementation(() => {})
  mocked.setupMessageListener.mockImplementation(() => {})
  options.setupMocks?.()
  const harness = createChromeHarness(options.initialStorage ?? {})
  await import('@/entrypoints/background')
  await flushMicrotasks()

  // 初期化IIFE由来の呼び出しは以降の検証から除外する
  if (options.clearAfterImport !== false) {
    vi.clearAllMocks()
  }
  return harness
}
const triggerInstalled = async (
  harness: ChromeHarness,
  reason: 'install' | 'update' | 'chrome_update',
): Promise<void> => {
  await Promise.all(
// eslint-disable-next-line typescript/await-thenable
    harness.onInstalledListeners.map((listener) =>
      listener({
        reason,
      }),
    ),
  )
}
const triggerStartup = async (harness: ChromeHarness): Promise<void> => {
// eslint-disable-next-line typescript/await-thenable
  await Promise.all(harness.onStartupListeners.map((listener) => listener()))
}
// eslint-disable-next-line vitest/require-top-level-describe
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('バックグラウンドのライフサイクル時の自動オープン挙動', () => {
  it('インストール時に helper 経由で saved-tabs を開いてピン留めする', async () => {
    const harness = await loadBackground({
      clearAfterImport: false,
    })
    expect(harness.onInstalledListeners).toHaveLength(1)
    expect(harness.onStartupListeners).toHaveLength(1)
    expect(harness.actionAddListener).toHaveBeenCalledWith(
      mocked.handleExtensionActionClick,
    )
    expect(harness.tabsOnCreatedAddListener).toHaveBeenCalledWith(
      mocked.handleTabCreated,
    )
    expect(mocked.setupMessageListener).toHaveBeenCalledTimes(1)
    await triggerInstalled(harness, 'install')
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
    expect(harness.tabsCreate).not.toHaveBeenCalled()
    expect(harness.storageSet).toHaveBeenCalledWith({
      seenVersion: '9.9.9',
      changelogShown: true,
    })
  })
  it('更新時は最初に changelog を開き、その後 saved-tabs を開く', async () => {
    const harness = await loadBackground({
      initialStorage: {
        seenVersion: '9.9.8',
        changelogShown: false,
      },
    })
    await triggerInstalled(harness, 'update')
    expect(harness.tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://tabbin/changelog.html',
    })
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
    expect(harness.storageSet).toHaveBeenCalledWith({
      seenVersion: '9.9.9',
      changelogShown: true,
    })
    expect(harness.tabsCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.openSavedTabsPage.mock.invocationCallOrder[0],
    )
  })
  it('ブラウザー起動時に saved-tabs を開く', async () => {
    const harness = await loadBackground()
    await triggerStartup(harness)
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
  })
  it('changelog が既に表示済みのときだけ seenVersion を更新する', async () => {
    const harness = await loadBackground({
      initialStorage: {
        seenVersion: '9.9.8',
        changelogShown: true,
      },
    })
    await triggerInstalled(harness, 'update')
    expect(harness.tabsCreate).not.toHaveBeenCalled()
    expect(harness.storageSet).toHaveBeenCalledWith({
      seenVersion: '9.9.9',
    })
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
  })
  it('バージョンが同じでも更新時には saved-tabs を開く', async () => {
    const harness = await loadBackground({
      initialStorage: {
        seenVersion: '9.9.9',
        changelogShown: false,
      },
    })
    await triggerInstalled(harness, 'update')
    expect(harness.tabsCreate).not.toHaveBeenCalled()
    expect(harness.storageSet).not.toHaveBeenCalled()
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
  })
  it('chrome_update の onInstalled リスナーでは何もしない', async () => {
    const harness = await loadBackground()
    await triggerInstalled(harness, 'chrome_update')

    // chrome_update ではUI起動は行わない（マイグレーションはIIFEで実行済み）
    expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
    expect(harness.tabsCreate).not.toHaveBeenCalled()
    // onInstalledリスナー経由ではマイグレーションを実行しない
    expect(mocked.migrateParentCategoriesToDomainNames).not.toHaveBeenCalled()
  })
  it('インストール時の自動オープンフローのエラーを捕捉する', async () => {
    const harness = await loadBackground()
    const errorSpy = vi.mocked(console.error)
    mocked.openSavedTabsPage.mockRejectedValueOnce(new Error('open failed'))
    await triggerInstalled(harness, 'install')
    expect(errorSpy).toHaveBeenCalledWith(
      'インストール/更新時の自動オープン処理エラー:',
      expect.any(Error),
    )
    expect(harness.storageSet).not.toHaveBeenCalledWith({
      seenVersion: '9.9.9',
      changelogShown: true,
    })
  })
  it('起動時の自動オープンフローのエラーを捕捉する', async () => {
    const harness = await loadBackground()
    const errorSpy = vi.mocked(console.error)
    mocked.openSavedTabsPage.mockRejectedValueOnce(new Error('startup failed'))
    await triggerStartup(harness)
    expect(errorSpy).toHaveBeenCalledWith(
      '起動時のsaved-tabsページ自動オープンに失敗しました:',
      expect.any(Error),
    )
  })
  it('バックグラウンド初期化 IIFE 内のマイグレーションエラーを捕捉する', async () => {
    mocked.migrateParentCategoriesToDomainNames.mockRejectedValueOnce(
      new Error('migration failed'),
    )
    using errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadBackground({
      clearAfterImport: false,
    })
    expect(errorSpy).toHaveBeenCalledWith(
      'バックグラウンド初期化エラー:',
      expect.any(Error),
    )
  })
  it('バックグラウンドセットアップ中のコンテキストメニュー初期化エラーを処理する', async () => {
    const errorSpy = vi.mocked(console.error)
    await loadBackground({
      clearAfterImport: false,
      setupMocks: () => {
        mocked.createContextMenus.mockImplementation(() => {
          throw new Error('context menu failed')
        })
      },
    })
    expect(errorSpy).toHaveBeenCalledWith(
      'コンテキストメニュー初期化エラー:',
      expect.any(Error),
    )
  })
  it('バックグラウンド初期化 IIFE のエラーを処理する', async () => {
    const errorSpy = vi.mocked(console.error)
    await loadBackground({
      clearAfterImport: false,
      setupMocks: () => {
        mocked.getParentCategories.mockRejectedValue(
          new Error('categories failed'),
        )
      },
    })
    expect(errorSpy).toHaveBeenCalledWith(
      'バックグラウンド初期化エラー:',
      expect.any(Error),
    )
    expect(mocked.setupExpiredTabsCheckAlarm).not.toHaveBeenCalled()
  })
  it('本番モードでは console.log と console.debug を抑制する', async () => {
    const originalLog = console.log
    const originalDebug = console.debug
    try {
      await loadBackground({
        clearAfterImport: false,
        dev: false,
      })
      expect(console.log).not.toBe(originalLog)
      expect(console.debug).not.toBe(originalDebug)
      expect(() => {
        console.log('suppressed')
      }).not.toThrow()
      expect(() => {
        console.debug('suppressed')
      }).not.toThrow()
    } finally {
      vi.unstubAllEnvs()
      console.log = originalLog
      console.debug = originalDebug
    }
  })
})

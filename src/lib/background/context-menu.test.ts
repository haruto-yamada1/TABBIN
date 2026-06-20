import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  handleSaveCurrentTab: vi.fn(),
  handleSaveWindowTabs: vi.fn(),
  handleSaveSameDomainTabs: vi.fn(),
  handleSaveAllWindowsTabs: vi.fn(),
  openSavedTabsPage: vi.fn(),
}))
vi.mock('./extension-actions', () => ({
  handleSaveCurrentTab: mocked.handleSaveCurrentTab,
  handleSaveWindowTabs: mocked.handleSaveWindowTabs,
  handleSaveSameDomainTabs: mocked.handleSaveSameDomainTabs,
  handleSaveAllWindowsTabs: mocked.handleSaveAllWindowsTabs,
}))
vi.mock('./saved-tabs-page', () => ({
  openSavedTabsPage: mocked.openSavedTabsPage,
}))

import { createContextMenus } from './context-menu'

type ClickListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) => void | Promise<void>

const flushAsync = async () => new Promise((resolve) => setTimeout(resolve, 0))

const createChromeHarness = (
  options: {
    withContextMenus?: boolean
    runtimeLastError?: unknown
    removeAllThrows?: Error
    createThrows?: Error
  } = {},
) => {
  const listeners: ClickListener[] = []
  const create = vi.fn(() => {
    if (options.createThrows) {
      throw options.createThrows
    }
  })
  const removeAll = vi.fn((cb?: () => void) => {
    if (options.removeAllThrows) {
      throw options.removeAllThrows
    }
    cb?.()
  })
  const addListener = vi.fn((listener: ClickListener) => {
    listeners.push(listener)
  })
  const chromeMock: Partial<typeof chrome> = {
    runtime: {
      lastError: options.runtimeLastError as
        | chrome.runtime.LastError
        | undefined,
    } as unknown as typeof chrome.runtime,
  }
  if (options.withContextMenus !== false) {
    chromeMock.contextMenus = {
      create: create as unknown as typeof chrome.contextMenus.create,
      removeAll: removeAll as unknown as typeof chrome.contextMenus.removeAll,
      onClicked: {
        addListener:
          addListener as unknown as typeof chrome.contextMenus.onClicked.addListener,
      },
    } as unknown as typeof chrome.contextMenus
  }
  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = chromeMock as unknown as typeof chrome
  return {
    create,
    removeAll,
    addListener,
    listeners,
  }
}
describe('createContextMenus関数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.handleSaveCurrentTab.mockResolvedValue([])
    mocked.handleSaveWindowTabs.mockResolvedValue([])
    mocked.handleSaveSameDomainTabs.mockResolvedValue([])
    mocked.handleSaveAllWindowsTabs.mockResolvedValue([])
    mocked.openSavedTabsPage.mockResolvedValue(999)
  })
  it('contextMenus API が利用できない場合にエラーをログ出力する', () => {
    createChromeHarness({
      withContextMenus: false,
    })
    createContextMenus()
    expect(console.error).toHaveBeenCalledWith(
      'chrome.contextMenus APIが利用できません。manifest.jsonのパーミッションを確認してください。',
    )
  })
  it('メニュー項目を作成してクリックハンドラをディスパッチする', async () => {
    const harness = createChromeHarness()
    mocked.handleSaveCurrentTab.mockResolvedValueOnce([
      { url: 'https://a.example', title: 'A' },
    ])
    mocked.handleSaveWindowTabs.mockResolvedValueOnce([
      { url: 'https://b.example', title: 'B' },
    ])
    mocked.handleSaveSameDomainTabs.mockResolvedValueOnce([
      { url: 'https://c.example', title: 'C' },
    ])
    mocked.handleSaveAllWindowsTabs.mockResolvedValueOnce([
      { url: 'https://d.example', title: 'D' },
    ])
    createContextMenus()
    await flushAsync()
    expect(harness.removeAll).toHaveBeenCalledTimes(1)
    expect(harness.create).toHaveBeenCalledTimes(6)
    expect(harness.create).toHaveBeenCalledWith({
      id: 'sepOpenSavedTabs',
      title: '',
      contexts: ['page'],
      type: 'separator',
    })
    expect(harness.listeners).toHaveLength(1)
    await harness.listeners[0]({
      menuItemId: 'saveCurrentTab',
    } as chrome.contextMenus.OnClickData)
    await harness.listeners[0]({
      menuItemId: 'saveAllTabs',
    } as chrome.contextMenus.OnClickData)
    await harness.listeners[0]({
      menuItemId: 'saveSameDomainTabs',
    } as chrome.contextMenus.OnClickData)
    await harness.listeners[0]({
      menuItemId: 'saveAllWindowsTabs',
    } as chrome.contextMenus.OnClickData)
    await harness.listeners[0]({
      menuItemId: 'openSavedTabs',
    } as chrome.contextMenus.OnClickData)
    await harness.listeners[0]({
      menuItemId: 'unknown-menu-id',
    } as chrome.contextMenus.OnClickData)
    expect(mocked.handleSaveCurrentTab).toHaveBeenCalledTimes(1)
    expect(mocked.handleSaveWindowTabs).toHaveBeenCalledTimes(1)
    expect(mocked.handleSaveSameDomainTabs).toHaveBeenCalledTimes(1)
    expect(mocked.handleSaveAllWindowsTabs).toHaveBeenCalledTimes(1)
    expect(mocked.openSavedTabsPage).toHaveBeenCalledTimes(1)
  })
  it('runtime.lastError の削除エラーをログ出力して継続する', async () => {
    const harness = createChromeHarness({
      runtimeLastError: {
        message: 'remove failed',
      },
    })
    createContextMenus()
    await flushAsync()
    expect(console.error).toHaveBeenCalledWith('メニュー削除エラー:', {
      message: 'remove failed',
    })
    expect(harness.create).toHaveBeenCalledTimes(6)
    expect(harness.addListener).toHaveBeenCalledTimes(1)
  })
  it('クリックハンドラのエラーを捕捉する', async () => {
    const harness = createChromeHarness()
    const error = new Error('save failed')
    mocked.handleSaveCurrentTab.mockRejectedValueOnce(error)
    createContextMenus()
    await flushAsync()
    await harness.listeners[0]({
      menuItemId: 'saveCurrentTab',
    } as chrome.contextMenus.OnClickData)
    expect(console.error).toHaveBeenCalledWith(
      'コンテキストメニュー処理エラー:',
      error,
    )
  })
  it('保存結果が空配列でも保存処理自体は実行される', async () => {
    const harness = createChromeHarness()
    mocked.handleSaveCurrentTab.mockResolvedValueOnce([])
    createContextMenus()
    await flushAsync()

    await harness.listeners[0]({
      menuItemId: 'saveCurrentTab',
    } as chrome.contextMenus.OnClickData)

    expect(mocked.handleSaveCurrentTab).toHaveBeenCalledTimes(1)
  })
  it('メニュー削除セットアップ中の例外を捕捉する', () => {
    const error = new Error('removeAll crashed')
    createChromeHarness({
      removeAllThrows: error,
    })
    createContextMenus()
    expect(console.error).toHaveBeenCalledWith('メニュー削除中のエラー:', error)
  })
  it('メニュー項目作成中の例外を捕捉する', async () => {
    const error = new Error('create crashed')
    createChromeHarness({
      createThrows: error,
    })
    createContextMenus()
    await flushAsync()
    expect(console.error).toHaveBeenCalledWith('メニュー作成エラー:', error)
  })
})

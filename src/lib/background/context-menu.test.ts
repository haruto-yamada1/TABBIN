import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ContextMenuModule from './context-menu'

const mocked = vi.hoisted(() => ({
  getBackgroundMessage: vi.fn(async (key: string) => key),
  handleSaveCurrentTab: vi.fn(),
  handleSaveWindowTabs: vi.fn(),
  handleSaveSameDomainTabs: vi.fn(),
  handleSaveAllWindowsTabs: vi.fn(),
  openSavedTabsPage: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock('./i18n', () => ({ getBackgroundMessage: mocked.getBackgroundMessage }))
vi.mock('./extension-actions', () => ({
  handleSaveCurrentTab: mocked.handleSaveCurrentTab,
  handleSaveWindowTabs: mocked.handleSaveWindowTabs,
  handleSaveSameDomainTabs: mocked.handleSaveSameDomainTabs,
  handleSaveAllWindowsTabs: mocked.handleSaveAllWindowsTabs,
}))
vi.mock('./saved-tabs-page', () => ({
  openSavedTabsPage: mocked.openSavedTabsPage,
}))
vi.mock('@/lib/logging/logger', () => ({ logger: mocked.logger }))

type ClickListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) => void | Promise<void>
type SettingsListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void
const ids = [
  'openSavedTabs',
  'sepOpenSavedTabs',
  'saveCurrentTab',
  'saveAllTabs',
  'saveSameDomainTabs',
  'saveAllWindowsTabs',
]
const createChromeHarness = () => {
  const listeners = new Set<ClickListener>()
  const settingsListeners = new Set<SettingsListener>()
  const menus = new Map<
    string,
    { id?: string; title?: string; type?: string; contexts?: readonly string[] }
  >()
  const runtime: { lastError: chrome.runtime.LastError | undefined } = {
    lastError: undefined,
  }
  const callbackWithError = (callback: () => void, message?: string) => {
    runtime.lastError = message ? { message } : undefined
    try {
      callback()
    } finally {
      runtime.lastError = undefined
    }
  }
  const create = vi.fn(
    (item: chrome.contextMenus.CreateProperties, callback: () => void) => {
      const id = String(item.id)
      if (menus.has(id)) {
        callbackWithError(callback, 'duplicate')
        return
      }
      menus.set(id, item)
      callbackWithError(callback)
    },
  )
  const update = vi.fn(
    (
      id: string,
      properties: Omit<chrome.contextMenus.CreateProperties, 'id'>,
      callback: () => void,
    ) => {
      const previous = menus.get(id)
      if (!previous) {
        callbackWithError(callback, 'missing')
        return
      }
      menus.set(id, { ...previous, ...properties })
      callbackWithError(callback)
    },
  )
  const removeAll = vi.fn((callback: () => void) => {
    menus.clear()
    callbackWithError(callback)
  })
  const addListener = vi.fn((listener: ClickListener) => {
    listeners.add(listener)
  })
  const settingsAddListener = vi.fn((listener: SettingsListener) => {
    settingsListeners.add(listener)
  })
  const api = {
    runtime,
    contextMenus: {
      create,
      update,
      removeAll,
      onClicked: {
        addListener,
        hasListener: (listener: ClickListener) => listeners.has(listener),
      },
    },
    storage: {
      onChanged: {
        addListener: settingsAddListener,
        hasListener: (listener: SettingsListener) =>
          settingsListeners.has(listener),
      },
    },
  }
  vi.stubGlobal('chrome', api)
  return {
    api,
    listeners,
    settingsListeners,
    menus,
    create,
    update,
    removeAll,
    addListener,
    settingsAddListener,
    callbackWithError,
  }
}
let subject: typeof ContextMenuModule
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  mocked.getBackgroundMessage.mockImplementation(async (key: string) => key)
  for (const action of [
    mocked.handleSaveCurrentTab,
    mocked.handleSaveWindowTabs,
    mocked.handleSaveSameDomainTabs,
    mocked.handleSaveAllWindowsTabs,
    mocked.openSavedTabsPage,
  ]) {
    action.mockResolvedValue([])
  }
  subject = await import('./context-menu')
})

describe('synchronous context menu subscriptions', () => {
  it('removeAll callback が未解決でも click listener を同期登録する', async () => {
    const harness = createChromeHarness()
    const removal = Promise.withResolvers<undefined>()
    harness.removeAll.mockImplementationOnce((callback) => {
      void removal.promise.then(callback)
    })
    subject.registerContextMenuClickListener()
    const pending = subject.reconcileContextMenus({ reset: true })
    await vi.waitFor(() => expect(harness.removeAll).toHaveBeenCalledOnce())
    expect(harness.addListener).toHaveBeenCalledOnce()
    expect(harness.create).not.toHaveBeenCalled()
    removal.resolve(undefined)
    await pending
  })

  it('翻訳 Promise が未解決でも click listener を同期登録する', async () => {
    const translation = Promise.withResolvers<string>()
    mocked.getBackgroundMessage.mockReturnValue(translation.promise)
    const harness = createChromeHarness()
    subject.registerContextMenuClickListener()
    const pending = subject.reconcileContextMenus()
    expect(harness.addListener).toHaveBeenCalledOnce()
    expect(harness.update).not.toHaveBeenCalled()
    translation.resolve('Translated')
    await pending
  })

  it('同じ起動内の重複初期化でも listener を一度だけ登録する', () => {
    const harness = createChromeHarness()
    for (let count = 0; count < 2; count++) {
      subject.registerContextMenuClickListener()
      subject.registerContextMenuSettingsListener()
    }
    expect(harness.addListener).toHaveBeenCalledOnce()
    expect(harness.settingsAddListener).toHaveBeenCalledOnce()
  })

  it.each([
    ['saveCurrentTab', mocked.handleSaveCurrentTab],
    ['saveAllTabs', mocked.handleSaveWindowTabs],
    ['saveSameDomainTabs', mocked.handleSaveSameDomainTabs],
    ['saveAllWindowsTabs', mocked.handleSaveAllWindowsTabs],
    ['openSavedTabs', mocked.openSavedTabsPage],
  ] as const)(
    '%s を翻訳やメニュー構築より先に dispatch し tab 引数を転送しない',
    async (menuItemId, action) => {
      const harness = createChromeHarness()
      subject.registerContextMenuClickListener()
      const [listener] = harness.listeners
      assert.isDefined(listener)
      await listener(
        { menuItemId } as chrome.contextMenus.OnClickData,
        { id: 999 } as chrome.tabs.Tab,
      )
      expect(action).toHaveBeenCalledExactlyOnceWith()
      expect(harness.create).not.toHaveBeenCalled()
    },
  )

  it.each(['sepOpenSavedTabs', 'unknown-menu-id', 42])(
    '%s を安全に無視する',
    async (menuItemId) => {
      const harness = createChromeHarness()
      subject.registerContextMenuClickListener()
      const [listener] = harness.listeners
      assert.isDefined(listener)
      await listener({ menuItemId } as chrome.contextMenus.OnClickData)
      expect(mocked.handleSaveCurrentTab).not.toHaveBeenCalled()
      expect(mocked.handleSaveWindowTabs).not.toHaveBeenCalled()
      expect(mocked.handleSaveSameDomainTabs).not.toHaveBeenCalled()
      expect(mocked.handleSaveAllWindowsTabs).not.toHaveBeenCalled()
      expect(mocked.openSavedTabsPage).not.toHaveBeenCalled()
    },
  )

  it('保存例外を捕捉して後続 click を処理し、URL やタイトルをログへ追加しない', async () => {
    const harness = createChromeHarness()
    subject.registerContextMenuClickListener()
    const [listener] = harness.listeners
    assert.isDefined(listener)
    const error = new Error('private URL/title')
    mocked.handleSaveCurrentTab.mockRejectedValueOnce(error)
    await expect(
      Promise.resolve(
        listener({
          menuItemId: 'saveCurrentTab',
        } as chrome.contextMenus.OnClickData),
      ),
    ).resolves.toBeUndefined()
    expect(mocked.logger.error).toHaveBeenCalledExactlyOnceWith(
      'background_context_menu_action_failed',
      error,
    )
    await listener({
      menuItemId: 'saveCurrentTab',
    } as chrome.contextMenus.OnClickData)
    expect(mocked.handleSaveCurrentTab).toHaveBeenCalledTimes(2)
  })

  it('登録 API の例外を捕捉し、次の登録で復旧する', () => {
    const harness = createChromeHarness()
    harness.addListener.mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    expect(() => subject.registerContextMenuClickListener()).not.toThrow()
    subject.registerContextMenuClickListener()
    expect(harness.listeners.size).toBe(1)
  })
})

describe('recoverable context menu reconciliation', () => {
  it('同じ6項目を順序・翻訳・separatorを保って作成し、次回は削除や作成をしない', async () => {
    const harness = createChromeHarness()
    await subject.reconcileContextMenus()
    expect([...harness.menus.keys()]).toEqual(ids)
    expect(harness.menus.get('sepOpenSavedTabs')).toEqual({
      id: 'sepOpenSavedTabs',
      title: '',
      contexts: ['page'],
      type: 'separator',
    })
    expect(harness.menus.get('saveCurrentTab')).toMatchObject({
      title: 'background.contextMenu.saveCurrentTab',
      contexts: ['page'],
    })
    await subject.reconcileContextMenus()
    expect(harness.removeAll).not.toHaveBeenCalled()
    expect(harness.create).toHaveBeenCalledTimes(6)
    expect(harness.update).toHaveBeenCalledTimes(12)
  })

  it('install/update reset で旧定義を消し、並行 reconcile を直列化する', async () => {
    const harness = createChromeHarness()
    harness.menus.set('obsolete', { id: 'obsolete', title: 'Obsolete' })
    await Promise.all([
      subject.reconcileContextMenus(),
      subject.reconcileContextMenus({ reset: true }),
      subject.reconcileContextMenus(),
    ])
    expect([...harness.menus.keys()]).toEqual(ids)
    expect(harness.removeAll).toHaveBeenCalledOnce()
    expect(harness.create).toHaveBeenCalledTimes(12)
  })

  it.each([
    'remove callback',
    'remove throw',
    'create callback',
    'create throw',
    'update throw',
    'translation',
  ])('%s 失敗でも click を維持し次回復旧する', async (failure) => {
    const harness = createChromeHarness()
    subject.registerContextMenuClickListener()
    if (failure === 'remove callback') {
      harness.removeAll.mockImplementationOnce((callback) =>
        harness.callbackWithError(callback, 'remove failed'),
      )
    }
    if (failure === 'remove throw') {
      harness.removeAll.mockImplementationOnce(() => {
        throw new Error('remove failed')
      })
    }
    if (failure === 'create callback') {
      harness.create.mockImplementationOnce((_item, callback) =>
        harness.callbackWithError(callback, 'create failed'),
      )
    }
    if (failure === 'create throw') {
      harness.create.mockImplementationOnce(() => {
        throw new Error('create failed')
      })
    }
    if (failure === 'update throw') {
      harness.update.mockImplementationOnce(() => {
        throw new Error('update failed')
      })
    }
    if (failure === 'translation') {
      mocked.getBackgroundMessage.mockRejectedValueOnce(
        new Error('translation failed'),
      )
    }
    await expect(
      subject.reconcileContextMenus({ reset: true }),
    ).resolves.toBeUndefined()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_context_menu_reconciliation_failed',
      expect.any(Error),
    )
    expect(harness.listeners.size).toBe(1)
    const itemFailed = [
      'create callback',
      'create throw',
      'update throw',
    ].includes(failure)
    // Successful later items stay in place; retry appends only the missing ID.
    expect([...harness.menus.keys()]).toEqual(itemFailed ? ids.slice(1) : [])
    await subject.reconcileContextMenus()
    expect([...harness.menus.keys()]).toEqual(
      itemFailed ? [...ids.slice(1), ids[0]] : ids,
    )
  })

  it('重複IDの失敗後も同じ照合で後続項目の更新と欠落項目の復旧を続ける', async () => {
    const harness = createChromeHarness()
    await subject.reconcileContextMenus()
    harness.menus.delete('saveAllWindowsTabs')
    harness.update.mockClear()
    mocked.getBackgroundMessage.mockImplementation(
      async (key: string) => `ja:${key}`,
    )
    harness.update.mockImplementationOnce((_id, _properties, callback) =>
      harness.callbackWithError(callback, 'update failed'),
    )
    await subject.reconcileContextMenus()
    expect(harness.menus.get('saveAllWindowsTabs')?.title).toBe(
      'ja:background.contextMenu.saveAllWindowsTabs',
    )
    expect(harness.menus.get('saveCurrentTab')?.title).toBe(
      'ja:background.contextMenu.saveCurrentTab',
    )
    expect(harness.update).toHaveBeenCalledTimes(6)
    expect(harness.menus.size).toBe(6)
    expect(mocked.logger.error).toHaveBeenCalledExactlyOnceWith(
      'background_context_menu_reconciliation_failed',
      expect.objectContaining({
        name: 'AggregateError',
        errors: [expect.any(Error)],
      }),
    )
    await subject.reconcileContextMenus()
    expect(harness.menus.size).toBe(6)
    expect(harness.menus.get('openSavedTabs')?.title).toBe(
      'ja:background.contextMenu.openSavedTabs',
    )
  })

  it('複数項目の作成失敗を集約し、成功する後続項目を同じ照合で作成する', async () => {
    const harness = createChromeHarness()
    const create = harness.create.getMockImplementation()
    assert.isDefined(create)
    const failedIds = new Set(['openSavedTabs', 'saveCurrentTab'])
    harness.create.mockImplementation((item, callback) => {
      if (failedIds.has(String(item.id))) {
        harness.callbackWithError(callback, 'create failed')
      } else {
        create(item, callback)
      }
    })
    await expect(subject.reconcileContextMenus()).resolves.toBeUndefined()
    expect([...harness.menus.keys()]).toEqual(
      ids.filter((id) => !failedIds.has(id)),
    )
    expect(harness.update).toHaveBeenCalledTimes(6)
    expect(mocked.logger.error).toHaveBeenCalledExactlyOnceWith(
      'background_context_menu_reconciliation_failed',
      expect.objectContaining({
        name: 'AggregateError',
        errors: [expect.any(Error), expect.any(Error)],
      }),
    )
    harness.create.mockImplementation(create)
    await subject.reconcileContextMenus()
    expect(harness.menus.size).toBe(6)
  })

  it('前項目の browser callback 完了まで次項目を開始せず挿入順を保つ', async () => {
    const harness = createChromeHarness()
    const create = harness.create.getMockImplementation()
    assert.isDefined(create)
    const firstCreate = Promise.withResolvers<() => void>()
    harness.create.mockImplementationOnce((item, callback) => {
      firstCreate.resolve(() => create(item, callback))
    })
    const reconciliation = subject.reconcileContextMenus()
    const completeFirstCreate = await firstCreate.promise
    expect(harness.update).toHaveBeenCalledTimes(1)
    expect(harness.create).toHaveBeenCalledTimes(1)
    completeFirstCreate()
    await reconciliation
    expect([...harness.menus.keys()]).toEqual(ids)
  })

  it.each([
    undefined,
    {},
    { contextMenus: {} },
    { contextMenus: { onClicked: {} } },
    { storage: { onChanged: {} } },
  ])('chrome/API が不足していても例外を漏らさない (%j)', async (api) => {
    vi.stubGlobal('chrome', api)
    expect(() => subject.registerContextMenuClickListener()).not.toThrow()
    expect(() => subject.registerContextMenuSettingsListener()).not.toThrow()
    await expect(subject.reconcileContextMenus()).resolves.toBeUndefined()
    expect(mocked.logger.warn).toHaveBeenCalled()
  })

  it('言語変更時のみタイトルを更新し、無関係な設定・storage area は無視する', async () => {
    const harness = createChromeHarness()
    subject.registerContextMenuSettingsListener()
    await subject.reconcileContextMenus()
    const [listener] = harness.settingsListeners
    assert.isDefined(listener)
    mocked.getBackgroundMessage.mockImplementation(
      async (key: string) => `ja:${key}`,
    )
    listener(
      {
        userSettings: {
          oldValue: { language: 'en' },
          newValue: { language: 'ja' },
        },
      },
      'local',
    )
    await subject.reconcileContextMenus()
    expect(harness.menus.get('saveCurrentTab')?.title).toBe(
      'ja:background.contextMenu.saveCurrentTab',
    )
    harness.update.mockClear()
    listener(
      {
        userSettings: {
          oldValue: { language: 'ja', colors: {} },
          newValue: { language: 'ja', colors: { a: 'red' } },
        },
      },
      'local',
    )
    listener(
      { userSettings: { oldValue: null, newValue: { language: 'en' } } },
      'sync',
    )
    listener({ other: { newValue: true } }, 'local')
    await Promise.resolve()
    expect(harness.update).not.toHaveBeenCalled()
    expect(harness.create).toHaveBeenCalledTimes(6)
    expect(harness.removeAll).not.toHaveBeenCalled()
  })
})

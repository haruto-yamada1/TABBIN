import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { openSavedTabsPage, resetSavedTabsPageId } from './saved-tabs-page'

interface TabsHarness {
  create: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const createChromeHarness = (): TabsHarness => {
  const create = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async (createProperties: chrome.tabs.CreateProperties) =>
      ({
        id: 900,
        pinned: false,
        ...createProperties,
      }) as chrome.tabs.Tab,
  )
  const get = vi.fn()
  // eslint-disable-next-line typescript/require-await
  const query = vi.fn(async () => [])
  // eslint-disable-next-line typescript/require-await
  const remove = vi.fn(async () => undefined)
  const update = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async (tabId: number, updateProperties: chrome.tabs.UpdateProperties) =>
      ({
        id: tabId,
        ...updateProperties,
      }) as chrome.tabs.Tab,
  )

  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://tabbin/${path}`),
    },
    tabs: {
      create,
      get,
      query,
      remove,
      update,
    },
  } as unknown as typeof chrome

  return {
    create,
    get,
    query,
    remove,
    update,
  }
}

const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: partial.id,
    url: partial.url,
    pendingUrl: partial.pendingUrl,
    pinned: partial.pinned ?? false,
  }) as chrome.tabs.Tab

describe('saved-tabs-page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createChromeHarness()
    resetSavedTabsPageId()
  })

  it('app.html#/saved-tabs の既存タブを再利用して新規作成しない', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 41,
        url: 'chrome-extension://tabbin/app.html#/saved-tabs',
        pinned: false,
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(41)

    expect(chromeTabs.create).not.toHaveBeenCalled()
    expect(chromeTabs.update).toHaveBeenNthCalledWith(1, 41, {
      active: true,
    })
    expect(chromeTabs.update).toHaveBeenNthCalledWith(2, 41, {
      pinned: true,
    })
  })

  it('app.html#/saved-tabs?mode=custom の既存タブを再利用する', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 42,
        url: 'chrome-extension://tabbin/app.html#/saved-tabs?mode=custom',
        pinned: true,
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(42)

    expect(chromeTabs.create).not.toHaveBeenCalled()
    expect(chromeTabs.update).toHaveBeenCalledTimes(1)
    expect(chromeTabs.update).toHaveBeenCalledWith(42, {
      active: true,
    })
  })

  it('pendingUrl の saved-tabs app ルートも再利用する', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 43,
        pendingUrl:
          'chrome-extension://tabbin/app.html#/saved-tabs?mode=domain',
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(43)

    expect(chromeTabs.create).not.toHaveBeenCalled()
    expect(chromeTabs.update).toHaveBeenCalledWith(43, {
      active: true,
    })
  })

  it('saved-tabs 以外の app ルートは再利用せず新規作成する', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 51,
        url: 'chrome-extension://tabbin/app.html#/options',
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(900)

    expect(chromeTabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://tabbin/saved-tabs.html',
    })
  })

  it('saved-tabs ではない拡張ページやIDなし既存タブは再利用しない', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 52,
        url: 'chrome-extension://tabbin/popup.html',
      }),
      tab({
        url: 'chrome-extension://tabbin/saved-tabs.html',
      }),
      tab({
        id: 53,
        url: 'not a url app.html#/options',
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(900)

    expect(chromeTabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://tabbin/saved-tabs.html',
    })
  })

  it('saved-tabs タブが複数ある場合は先頭を再利用して重複を閉じる', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 61,
        url: 'chrome-extension://tabbin/app.html#/saved-tabs',
      }),
      tab({
        id: 62,
        url: 'chrome-extension://tabbin/saved-tabs.html?mode=custom',
      }),
    ])

    await expect(openSavedTabsPage()).resolves.toBe(61)

    expect(chromeTabs.create).not.toHaveBeenCalled()
    expect(chromeTabs.remove).toHaveBeenCalledWith(62)
  })

  it('保存済みタブ ID を再利用し、存在しない場合は新規作成へフォールバックする', async () => {
    const chromeTabs = createChromeHarness()

    await expect(openSavedTabsPage()).resolves.toBe(900)

    chromeTabs.get.mockResolvedValueOnce(
      tab({
        id: 900,
        pinned: true,
        url: 'chrome-extension://tabbin/saved-tabs.html',
      }),
    )

    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(chromeTabs.query).toHaveBeenCalledTimes(1)

    chromeTabs.get.mockResolvedValueOnce(undefined)
    chromeTabs.create.mockResolvedValueOnce(
      tab({
        id: 901,
        url: 'chrome-extension://tabbin/saved-tabs.html',
      }),
    )

    await expect(openSavedTabsPage()).resolves.toBe(901)
  })

  it('保存済みタブ ID の取得に失敗したら ID を捨てて新規作成する', async () => {
    const chromeTabs = createChromeHarness()

    await expect(openSavedTabsPage()).resolves.toBe(900)

    chromeTabs.get.mockRejectedValueOnce(new Error('tab missing'))
    chromeTabs.query.mockResolvedValueOnce([])
    chromeTabs.create.mockResolvedValueOnce(
      tab({
        id: 901,
        url: 'chrome-extension://tabbin/saved-tabs.html',
      }),
    )

    await expect(openSavedTabsPage()).resolves.toBe(901)
  })

  it('既存タブのピン留め失敗・重複タブ削除失敗をログだけで継続する', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([
      tab({
        id: 71,
        url: 'saved-tabs.html',
      }),
      tab({
        id: 72,
        url: 'chrome-extension://tabbin/app.html#/saved-tabs',
      }),
      tab({
        url: 'chrome-extension://tabbin/app.html#/saved-tabs',
      }),
    ])
    chromeTabs.update
      .mockResolvedValueOnce(tab({ id: 71 }))
      .mockRejectedValueOnce(new Error('pin failed'))
    chromeTabs.remove.mockRejectedValueOnce(new Error('remove failed'))

    await expect(openSavedTabsPage()).resolves.toBe(71)

    expect(chromeTabs.remove).toHaveBeenCalledWith(72)
    expect(console.error).toHaveBeenCalledWith(
      'タブのピン留め設定中にエラー:',
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      '重複タブを閉じる際にエラー:',
      expect.any(Error),
    )
  })

  it('作成中は既存 ID またはダミー値を返し、作成失敗時は null を返す', async () => {
    const chromeTabs = createChromeHarness()
    let resolveQuery: (tabs: chrome.tabs.Tab[]) => void = () => undefined
    let resolveGet: (tab: chrome.tabs.Tab) => void = () => undefined
    chromeTabs.get.mockRejectedValue(new Error('missing'))
    chromeTabs.query.mockImplementationOnce(
      // eslint-disable-next-line typescript/no-misused-promises
      () =>
        new Promise<chrome.tabs.Tab[]>((resolve) => {
          resolveQuery = resolve
        }),
    )

    const firstOpen = openSavedTabsPage()

    await expect(openSavedTabsPage()).resolves.toBe(-1)

    resolveQuery([])
    await expect(firstOpen).resolves.toBe(900)

    chromeTabs.get.mockImplementationOnce(
      // eslint-disable-next-line typescript/no-misused-promises
      () =>
        new Promise<chrome.tabs.Tab>((resolve) => {
          resolveGet = resolve
        }),
    )

    const secondOpen = openSavedTabsPage()
    await expect(openSavedTabsPage()).resolves.toBe(900)
    resolveGet(
      tab({
        id: 900,
        pinned: true,
        url: 'chrome-extension://tabbin/saved-tabs.html',
      }),
    )
    await expect(secondOpen).resolves.toBe(900)

    resetSavedTabsPageId()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockImplementationOnce(
      // eslint-disable-next-line typescript/no-misused-promises
      () =>
        new Promise<chrome.tabs.Tab[]>((resolve) => {
          resolveQuery = resolve
        }),
    )

    const thirdOpen = openSavedTabsPage()
    await expect(openSavedTabsPage()).resolves.toBe(-1)
    resolveQuery([])
    await expect(thirdOpen).resolves.toBe(900)

    resetSavedTabsPageId()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockRejectedValueOnce(new Error('query failed'))

    await expect(openSavedTabsPage()).resolves.toBeNull()
  })

  it('新規作成されたタブに ID がない場合は null を返す', async () => {
    const chromeTabs = createChromeHarness()
    chromeTabs.get.mockRejectedValueOnce(new Error('missing'))
    chromeTabs.query.mockResolvedValueOnce([])
    chromeTabs.create.mockResolvedValueOnce(tab({ id: undefined }))

    await expect(openSavedTabsPage()).resolves.toBeNull()
  })
})

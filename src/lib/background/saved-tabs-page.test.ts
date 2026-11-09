import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

import { openSavedTabsPage, resetSavedTabsPageId } from './saved-tabs-page'

// Match WXT's installed namespace selection while keeping each test's API isolated.
vi.mock('wxt/browser', () => ({
  get browser() {
    return globalThis.browser?.runtime?.id
      ? globalThis.browser
      : globalThis.chrome
  },
}))

const root = 'chrome-extension://tabbin/'
const savedUrl = `${root}saved-tabs.html`
const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({ pinned: false, ...partial }) as chrome.tabs.Tab

const createChromeHarness = (initialTabs: chrome.tabs.Tab[] = []) => {
  const tabs = [...initialTabs]
  const get = vi.fn(
    async (id: number): Promise<chrome.tabs.Tab | undefined> => {
      const found = tabs.find((candidate) => candidate.id === id)
      if (!found) {
        throw new Error('Tab not found')
      }
      return found
    },
  )
  const create = vi.fn(async (properties: chrome.tabs.CreateProperties) => {
    const created = tab({
      id: 900,
      url: properties.url,
      pinned: properties.pinned ?? false,
    })
    tabs.push(created)
    return created
  })
  const query = vi.fn(async () => [...tabs])
  const remove = vi.fn(async (_id: number) => undefined)
  const update = vi.fn(
    async (id: number, properties: chrome.tabs.UpdateProperties) => {
      const found = tabs.find((candidate) => candidate.id === id)
      if (!found) {
        throw new Error('Tab not found')
      }
      Object.assign(found, properties)
      return found
    },
  )
  const getURL = vi.fn((path: string) => `${root}${path.replace(/^\//, '')}`)
  vi.stubGlobal('chrome', {
    runtime: { getURL },
    tabs: { get, create, query, remove, update },
  })
  return { tabs, get, create, query, remove, update, getURL }
}

describe('saved-tabs-page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    resetSavedTabsPageId()
  })

  it.each(
    ['chrome-extension://tabbin/', 'moz-extension://firefox-uuid/'].flatMap(
      (extensionRoot) =>
        [
          'saved-tabs.html',
          'saved-tabs.html?mode=custom',
          'app.html#/saved-tabs',
          'app.html#/saved-tabs?mode=custom',
        ].map((path) => ({ extensionRoot, path })),
    ),
  )(
    '$extensionRoot$path の正規ページを再利用する',
    async ({ extensionRoot, path }) => {
      const harness = createChromeHarness([
        tab({ id: 41, url: `${extensionRoot}${path}` }),
      ])
      harness.getURL.mockImplementation(
        (name) => `${extensionRoot}${name.replace(/^\//, '')}`,
      )
      await expect(openSavedTabsPage()).resolves.toBe(41)
      expect(harness.create).not.toHaveBeenCalled()
      expect(harness.update).toHaveBeenCalledWith(41, { active: true })
      expect(harness.update).toHaveBeenCalledWith(41, { pinned: true })
    },
  )

  it.each([
    'https://example.com/saved-tabs.html',
    'http://example.com/app.html#/saved-tabs',
    'chrome-extension://another/saved-tabs.html',
    'moz-extension://tabbin/saved-tabs.html',
    'chrome-extension://tabbin.evil/saved-tabs.html',
    'chrome-extension://tabbin:123/saved-tabs.html',
    'chrome-extension://user@tabbin/saved-tabs.html',
    'chrome-extension://tabbin/nested/saved-tabs.html',
    'chrome-extension://tabbin/saved-tabs.html.evil',
    'chrome-extension://tabbin/app.html#/saved-tabs-evil',
    'chrome-extension://tabbin/app.html#/saved-tabs/extra',
    'chrome-extension://tabbin/app.html#/options?saved-tabs',
    'chrome-extension://tabbin/popup.html',
    'saved-tabs.html',
    'not a url app.html#/saved-tabs',
    'https://[invalid/saved-tabs.html',
    '',
    undefined,
  ])('正規でないURLは再利用・操作・削除しない: %s', async (url) => {
    const harness = createChromeHarness([tab({ id: 51, url })])
    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(harness.create).toHaveBeenCalledWith({ url: savedUrl, pinned: true })
    expect(harness.update.mock.calls.every(([id]) => id === 900)).toBe(true)
    expect(harness.remove).not.toHaveBeenCalled()
  })

  it.each([
    {
      url: undefined,
      pendingUrl: `${root}app.html#/saved-tabs?mode=domain`,
      reuse: true,
    },
    { url: 'https://example.test/', pendingUrl: savedUrl, reuse: true },
    {
      url: savedUrl,
      pendingUrl: 'https://example.test/saved-tabs.html',
      reuse: false,
    },
    { url: savedUrl, pendingUrl: `${root}app.html#/options`, reuse: false },
    { url: savedUrl, pendingUrl: 'saved-tabs.html', reuse: false },
  ])(
    'pendingUrlの遷移先を優先する: $pendingUrl',
    async ({ url, pendingUrl, reuse }) => {
      const harness = createChromeHarness([tab({ id: 43, url, pendingUrl })])
      await expect(openSavedTabsPage()).resolves.toBe(reuse ? 43 : 900)
      expect(harness.update.mock.calls.some(([id]) => id === 43)).toBe(reuse)
      expect(harness.remove).not.toHaveBeenCalled()
    },
  )

  it('Firefoxのcallback版chromeではなくPromise版browser APIで完了を待つ', async () => {
    const harness = createChromeHarness([
      tab({ id: 42, url: 'moz-extension://firefox-uuid/saved-tabs.html' }),
    ])
    harness.getURL.mockImplementation(
      (name) => `moz-extension://firefox-uuid/${name.replace(/^\//, '')}`,
    )
    const promiseApi = globalThis.chrome
    vi.stubGlobal('browser', {
      ...promiseApi,
      runtime: { ...promiseApi.runtime, id: 'tabbin@local' },
    })
    const callbackQuery = vi.fn(() => undefined)
    vi.stubGlobal('chrome', {
      runtime: promiseApi.runtime,
      tabs: { query: callbackQuery },
    })

    await expect(openSavedTabsPage()).resolves.toBe(42)
    expect(callbackQuery).not.toHaveBeenCalled()
    expect(harness.update).toHaveBeenCalledWith(42, { pinned: true })
  })

  it('IDなし候補を無視して有効な候補を再利用する', async () => {
    const harness = createChromeHarness([
      tab({ url: savedUrl }),
      tab({ id: 42, url: savedUrl, pinned: true }),
    ])
    await expect(openSavedTabsPage()).resolves.toBe(42)
    expect(harness.update).toHaveBeenCalledTimes(1)
  })

  it('キャッシュIDを現在URLで再検証し、移動済みなら正しい画面を作る', async () => {
    const harness = createChromeHarness()
    await expect(openSavedTabsPage()).resolves.toBe(900)
    const cached = harness.tabs[0]
    assert.isDefined(cached)
    cached.url = 'https://example.com/saved-tabs.html'
    harness.update.mockClear()
    harness.create.mockImplementationOnce(async () => {
      const created = tab({ id: 901, url: savedUrl })
      harness.tabs.push(created)
      return created
    })
    await expect(openSavedTabsPage()).resolves.toBe(901)
    expect(harness.update.mock.calls.every(([id]) => id === 901)).toBe(true)
    expect(harness.remove).not.toHaveBeenCalled()
  })

  it('キャッシュが正規のpendingUrlなら再検索せず再利用する', async () => {
    const harness = createChromeHarness()
    await openSavedTabsPage()
    const cached = harness.tabs[0]
    assert.isDefined(cached)
    Object.assign(cached, {
      url: undefined,
      pendingUrl: savedUrl,
      pinned: true,
    })
    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(harness.query).toHaveBeenCalledTimes(1)
  })

  it('キャッシュ取得が失敗しても再検索する', async () => {
    const harness = createChromeHarness()
    await openSavedTabsPage()
    harness.get.mockRejectedValueOnce(new Error('missing'))
    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(harness.query).toHaveBeenCalledTimes(2)
  })

  it('query後に別サイトへ移動した主候補を操作しない', async () => {
    const harness = createChromeHarness([
      tab({ id: 61, url: 'https://example.test/' }),
    ])
    harness.query.mockResolvedValueOnce([tab({ id: 61, url: savedUrl })])
    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(harness.update.mock.calls.every(([id]) => id === 900)).toBe(true)
  })

  it('activate後に別サイトへ遷移したタブをpinしない', async () => {
    const harness = createChromeHarness([tab({ id: 61, url: savedUrl })])
    const candidate = harness.tabs[0]
    assert.isDefined(candidate)
    harness.update.mockImplementationOnce(async () => {
      Object.assign(candidate, { pendingUrl: 'https://example.test/' })
      return candidate
    })
    await expect(openSavedTabsPage()).resolves.toBe(900)
    expect(harness.update).not.toHaveBeenCalledWith(61, { pinned: true })
  })

  it('主タブを除外し、重複IDを一度だけ最終検証して閉じる', async () => {
    const main = tab({ id: 61, url: savedUrl, pinned: true })
    const duplicate = tab({ id: 62, url: `${root}app.html#/saved-tabs` })
    const harness = createChromeHarness([main, main, duplicate, duplicate])
    await expect(openSavedTabsPage()).resolves.toBe(61)
    expect(harness.get).toHaveBeenCalledWith(62)
    expect(harness.remove).toHaveBeenCalledExactlyOnceWith(62)
  })

  it.each([
    tab({ id: 62, url: 'https://example.test/saved-tabs.html' }),
    tab({ id: 62, url: savedUrl, pendingUrl: 'https://example.test/' }),
    tab({ id: 63, url: savedUrl }),
    undefined,
  ])(
    '削除直前にURLまたはIDが変わった重複タブは削除しない: %j',
    async (current) => {
      const harness = createChromeHarness([
        tab({ id: 61, url: savedUrl, pinned: true }),
        tab({ id: 62, url: savedUrl }),
      ])
      const originalGet = harness.get.getMockImplementation()
      assert.isDefined(originalGet)
      harness.get.mockImplementation(async (id) =>
        id === 62 ? current : originalGet(id),
      )
      await expect(openSavedTabsPage()).resolves.toBe(61)
      expect(harness.remove).not.toHaveBeenCalled()
    },
  )

  it('消えた重複候補の取得失敗を許容する', async () => {
    const harness = createChromeHarness([
      tab({ id: 61, url: savedUrl, pinned: true }),
    ])
    harness.query.mockResolvedValueOnce([
      ...harness.tabs,
      tab({ id: 62, url: savedUrl }),
    ])
    await expect(openSavedTabsPage()).resolves.toBe(61)
    expect(harness.remove).not.toHaveBeenCalled()
  })

  it('pinと重複削除の失敗後も主タブIDを返す', async () => {
    const harness = createChromeHarness([
      tab({ id: 61, url: savedUrl }),
      tab({ id: 62, url: savedUrl }),
    ])
    const candidate = harness.tabs[0]
    assert.isDefined(candidate)
    harness.update
      .mockResolvedValueOnce(candidate)
      .mockRejectedValueOnce(new Error('pin failed'))
    harness.remove.mockRejectedValueOnce(new Error('remove failed'))
    await expect(openSavedTabsPage()).resolves.toBe(61)
    expect(harness.remove).toHaveBeenCalledWith(62)
    expect(console.error).toHaveBeenCalledWith(
      'タブのピン留め設定中にエラー:',
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      '重複タブを閉じる際にエラー:',
      expect.any(Error),
    )
  })

  it('menu/toolbar/startup相当の同時3回呼出は確定IDを待機して共有する', async () => {
    const harness = createChromeHarness()
    const deferred = Promise.withResolvers<chrome.tabs.Tab[]>()
    harness.query.mockReturnValueOnce(deferred.promise)
    const opens = [
      openSavedTabsPage(),
      openSavedTabsPage(),
      openSavedTabsPage(),
    ]
    const settled = vi.fn()
    void Promise.all(opens).then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    deferred.resolve([])
    await expect(Promise.all(opens)).resolves.toEqual([900, 900, 900])
    expect(harness.create).toHaveBeenCalledTimes(1)
  })

  it('キャッシュ取得中も未検証IDを早期返却しない', async () => {
    const harness = createChromeHarness()
    await openSavedTabsPage()
    const deferred = Promise.withResolvers<chrome.tabs.Tab>()
    harness.get.mockReturnValueOnce(deferred.promise)
    const first = openSavedTabsPage()
    const second = openSavedTabsPage()
    const settled = vi.fn()
    void second.then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    deferred.resolve(tab({ id: 900, url: savedUrl, pinned: true }))
    await expect(Promise.all([first, second])).resolves.toEqual([900, 900])
  })

  it.each(['query', 'create', 'update'] as const)(
    '%sの失敗は全待機者にnullを返し、次回再試行できる',
    async (operation) => {
      const harness = createChromeHarness(
        operation === 'update' ? [tab({ id: 900, url: savedUrl })] : [],
      )
      harness[operation].mockRejectedValueOnce(new Error('cancelled'))
      await expect(
        Promise.all([
          openSavedTabsPage(),
          openSavedTabsPage(),
          openSavedTabsPage(),
        ]),
      ).resolves.toEqual([null, null, null])
      await expect(openSavedTabsPage()).resolves.toBe(900)
    },
  )

  it('Firefoxの新規タブが一時about:blankでも作成確定IDを共有する', async () => {
    const harness = createChromeHarness()
    harness.create.mockResolvedValueOnce(tab({ id: 901, url: 'about:blank' }))
    await expect(
      Promise.all([
        openSavedTabsPage(),
        openSavedTabsPage(),
        openSavedTabsPage(),
      ]),
    ).resolves.toEqual([901, 901, 901])
    expect(harness.create).toHaveBeenCalledExactlyOnceWith({
      url: savedUrl,
      pinned: true,
    })
    expect(harness.get).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
  })

  it.each([undefined, -1, 1.5])(
    '作成結果IDが不正ならsentinelを返さずnullにする: %s',
    async (id) => {
      const harness = createChromeHarness()
      harness.create.mockResolvedValueOnce(tab({ id, url: savedUrl }))
      await expect(openSavedTabsPage()).resolves.toBeNull()
      expect(harness.update).not.toHaveBeenCalled()
    },
  )
})

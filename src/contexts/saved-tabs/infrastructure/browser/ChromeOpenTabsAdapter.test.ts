import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserOpenTabChange } from '@/contexts/saved-tabs/application/ports/OpenSavedTabsPort'

import { createChromeOpenTabsAdapter } from './ChromeOpenTabsAdapter'

type Tab = {
  id?: number
  url?: string | undefined
  incognito?: boolean
  title?: string
}

const createEvent = <Listener>() => {
  const listeners = new Set<Listener>()
  return {
    listeners,
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
  }
}

const createHarness = () => {
  const onCreated = createEvent<(tab: Tab) => void>()
  const onUpdated =
    createEvent<
      (id: number, change: { url?: string | undefined }, tab: Tab) => void
    >()
  const onRemoved = createEvent<(id: number) => void>()
  const onReplaced = createEvent<(addedId: number, removedId: number) => void>()
  const query = vi.fn<() => Promise<readonly Tab[]>>(async () => [])
  const get = vi.fn<(id: number) => Promise<Tab>>(async (id) => ({
    id,
    url: 'https://replacement.example/',
    incognito: false,
  }))
  const api = {
    extension: { inIncognitoContext: false },
    tabs: { query, get, onCreated, onUpdated, onRemoved, onReplaced },
  }
  const changes: BrowserOpenTabChange[] = []
  const adapter = createChromeOpenTabsAdapter({ getApi: () => api })
  return {
    adapter,
    api,
    changes,
    query,
    get,
    created: (tab: Tab) =>
      onCreated.listeners.forEach((listener) => listener(tab)),
    updated: (id: number, change: { url?: string | undefined }, tab: Tab) =>
      onUpdated.listeners.forEach((listener) => listener(id, change, tab)),
    removed: (id: number) =>
      onRemoved.listeners.forEach((listener) => listener(id)),
    replaced: (addedId: number, removedId: number) =>
      onReplaced.listeners.forEach((listener) => listener(addedId, removedId)),
    events: [onCreated, onUpdated, onRemoved, onReplaced],
    subscribe: () => adapter.subscribe((change) => changes.push(change)),
  }
}

const deferred = <T>() => {
  let settle: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, resolve: settle }
}

describe('createChromeOpenTabsAdapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('queries once and exposes only normal tabs and the exact visible source URL', async () => {
    const harness = createHarness()
    harness.query.mockResolvedValue([
      {
        id: 1,
        url: 'https://EXAMPLE.com:443/path?q=1#raw',
        incognito: false,
        title: 'private title',
      },
      { id: 2, url: 'https://private.example/', incognito: true },
      { id: 3, url: 'https://unknown.example/' },
      { id: 4, incognito: false },
      { url: 'https://no-id.example/', incognito: false },
    ])

    expect(await harness.adapter.query()).toStrictEqual([
      { id: 1, url: 'https://EXAMPLE.com:443/path?q=1#raw' },
      { id: 4 },
    ])
    expect(harness.query).toHaveBeenCalledExactlyOnceWith({})
  })

  it('publishes only URL changes, creation and removal without querying all tabs again', async () => {
    const harness = createHarness()
    const unsubscribe = harness.subscribe()
    harness.created({ id: 1, url: 'https://normal.example/', incognito: false })
    harness.updated(
      1,
      {},
      { id: 1, url: 'https://normal.example/', incognito: false },
    )
    harness.updated(
      1,
      { url: 'https://normal.example/#next' },
      { id: 1, url: 'https://normal.example/#next', incognito: false },
    )
    harness.updated(1, { url: undefined }, { id: 1, incognito: false })
    harness.removed(1)

    expect(harness.changes).toStrictEqual([
      { type: 'upsert', tab: { id: 1, url: 'https://normal.example/' } },
      { type: 'upsert', tab: { id: 1, url: 'https://normal.example/#next' } },
      { type: 'upsert', tab: { id: 1 } },
      { type: 'remove', tabId: 1 },
    ])
    expect(harness.query).not.toHaveBeenCalled()
    expect(harness.get).not.toHaveBeenCalled()
    unsubscribe()
    expect(harness.events.every((event) => event.listeners.size === 0)).toBe(
      true,
    )
    harness.created({
      id: 9,
      url: 'https://after-cleanup.example/',
      incognito: false,
    })
    expect(harness.changes).toHaveLength(4)
  })

  it('does not expose private or unknown-scope URL events', () => {
    const harness = createHarness()
    harness.subscribe()
    harness.created({ id: 1, url: 'https://private.example/', incognito: true })
    harness.created({ id: 2, url: 'https://unknown.example/' })
    harness.updated(
      3,
      { url: 'https://private.example/changed' },
      { id: 3, incognito: true },
    )
    harness.created({ url: 'https://missing-id.example/', incognito: false })
    expect(harness.changes).toStrictEqual([
      { type: 'remove', tabId: 1 },
      { type: 'remove', tabId: 2 },
      { type: 'remove', tabId: 3 },
    ])
    expect(JSON.stringify(harness.changes)).not.toContain('https:')
  })

  it('never queries or subscribes from a private extension context', async () => {
    const harness = createHarness()
    harness.api.extension.inIncognitoContext = true
    const unsubscribe = harness.subscribe()
    expect(await harness.adapter.query()).toStrictEqual([])
    expect(harness.query).not.toHaveBeenCalled()
    expect(harness.events.every((event) => event.listeners.size === 0)).toBe(
      true,
    )
    unsubscribe()
  })

  it('removes the replaced tab and reads only its normal replacement', async () => {
    const harness = createHarness()
    harness.subscribe()
    harness.replaced(20, 10)
    await Promise.resolve()
    expect(harness.changes).toStrictEqual([
      { type: 'remove', tabId: 10 },
      { type: 'upsert', tab: { id: 20, url: 'https://replacement.example/' } },
    ])
    expect(harness.get).toHaveBeenCalledExactlyOnceWith(20)
    expect(harness.query).not.toHaveBeenCalled()
  })

  it.each(['private', 'missing', 'rejected'])(
    'does not expose a %s replacement',
    async (kind) => {
      const harness = createHarness()
      if (kind === 'rejected') {
        harness.get.mockRejectedValue(new Error('private details'))
      } else {
        harness.get.mockResolvedValue(
          kind === 'private'
            ? { id: 20, url: 'https://private.example/', incognito: true }
            : { id: 20, incognito: false },
        )
      }
      harness.subscribe()
      harness.replaced(20, 10)
      await Promise.resolve()
      await Promise.resolve()
      expect(JSON.stringify(harness.changes)).not.toContain('https:')
      expect(harness.changes[0]).toStrictEqual({ type: 'remove', tabId: 10 })
    },
  )

  it.each(['updated', 'removed', 'created', 'cleanup', 'replaced'])(
    'ignores a stale replacement read after %s',
    async (kind) => {
      const harness = createHarness()
      const reading = deferred<Tab>()
      harness.get.mockReturnValueOnce(reading.promise)
      const unsubscribe = harness.subscribe()
      harness.replaced(20, 10)
      if (kind === 'updated') {
        harness.updated(
          20,
          { url: 'https://new.example/' },
          { id: 20, url: 'https://new.example/', incognito: false },
        )
      }
      if (kind === 'removed') {
        harness.removed(20)
      }
      if (kind === 'created') {
        harness.created({
          id: 20,
          url: 'https://new.example/',
          incognito: false,
        })
      }
      if (kind === 'cleanup') {
        unsubscribe()
      }
      if (kind === 'replaced') {
        harness.replaced(30, 20)
      }
      reading.resolve({
        id: 20,
        url: 'https://stale.example/',
        incognito: false,
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(JSON.stringify(harness.changes)).not.toContain('stale.example')
    },
  )

  it('rejects unavailable APIs and query errors for the service to handle', async () => {
    const unavailable = createChromeOpenTabsAdapter({ getApi: () => undefined })
    await expect(unavailable.query()).rejects.toThrow(
      'Browser tab observation unavailable',
    )
    expect(() => unavailable.subscribe(() => {})).toThrow(
      'Browser tab observation unavailable',
    )
    const harness = createHarness()
    harness.query.mockRejectedValue(new Error('permission denied'))
    await expect(harness.adapter.query()).rejects.toThrow('permission denied')
  })

  it('uses Firefox browser promises before Chrome and falls back to Chrome when absent', async () => {
    const firefox = createHarness()
    firefox.query.mockResolvedValue([
      { id: 7, url: 'https://firefox.example/', incognito: false },
    ])
    const chrome = createHarness()
    chrome.query.mockResolvedValue([
      { id: 8, url: 'https://chrome.example/', incognito: false },
    ])
    vi.stubGlobal('browser', firefox.api)
    vi.stubGlobal('chrome', chrome.api)
    expect(await createChromeOpenTabsAdapter().query()).toStrictEqual([
      { id: 7, url: 'https://firefox.example/' },
    ])
    expect(chrome.query).not.toHaveBeenCalled()
    vi.stubGlobal('browser', undefined)
    expect(await createChromeOpenTabsAdapter().query()).toStrictEqual([
      { id: 8, url: 'https://chrome.example/' },
    ])
  })
})

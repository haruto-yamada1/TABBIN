import { describe, expect, it, vi } from 'vitest'

import type {
  BrowserOpenTab,
  BrowserOpenTabChange,
} from '@/contexts/saved-tabs/application/ports/OpenSavedTabsPort'

import { createOpenSavedTabsService } from './OpenSavedTabsService'

const A = 'https://example.com/a?q=1#one'
const B = 'https://example.com/b'
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
const setup = (
  queryResult: Promise<readonly BrowserOpenTab[]> = Promise.resolve([]),
) => {
  let emit: (change: BrowserOpenTabChange) => void = () => {}
  const unsubscribe = vi.fn()
  const query = vi.fn(async () => queryResult)
  const subscribe = vi.fn((listener: typeof emit) => {
    emit = listener
    return unsubscribe
  })
  return {
    service: createOpenSavedTabsService({ query, subscribe }),
    query,
    subscribe,
    unsubscribe,
    emit: (change: BrowserOpenTabChange) => emit(change),
  }
}

describe('open saved tabs', () => {
  it('shares one initial query and counts duplicate exact URLs across subscribers', async () => {
    const f = setup(
      Promise.resolve([
        { id: 1, url: A },
        { id: 2, url: A },
      ]),
    )
    const changed = vi.fn()
    const unrelated = vi.fn()
    const stop = f.service.subscribe(A, changed)
    const stopOther = f.service.subscribe(B, unrelated)
    await flush()
    expect(f.query).toHaveBeenCalledTimes(1)
    expect(f.service.getSnapshot(A)).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(unrelated).not.toHaveBeenCalled()
    f.emit({ type: 'remove', tabId: 1 })
    expect(f.service.getSnapshot(A)).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
    f.emit({ type: 'remove', tabId: 2 })
    expect(f.service.getSnapshot(A)).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
    stop()
    stopOther()
    expect(f.unsubscribe).toHaveBeenCalledTimes(1)
    expect(f.service.getSnapshot(A)).toBe(false)
  })

  it('keeps exact-url-v1 spelling rather than WHATWG-normalizing source strings', async () => {
    const f = setup(Promise.resolve([{ id: 1, url: A }]))
    const stop = f.service.subscribe(A, vi.fn())
    await flush()
    expect(f.service.getSnapshot(A)).toBe(true)
    for (const url of [
      A.toUpperCase(),
      'https://EXAMPLE.com/a?q=1#one',
      'https://example.com:443/a?q=1#one',
      'https://example.com/a/?q=1#one',
      'https://example.com/a?q=2#one',
      'https://example.com/a?q=1#two',
      ` ${A} `,
    ]) {
      expect(f.service.getSnapshot(url)).toBe(false)
    }
    stop()
  })

  it('replays changes arriving during query without publishing a stale snapshot', async () => {
    let resolveQuery: (tabs: readonly BrowserOpenTab[]) => void = () => {}
    const f = setup(
      new Promise((resolve) => {
        resolveQuery = resolve
      }),
    )
    const changed = vi.fn()
    f.service.subscribe(A, changed)
    f.service.subscribe(B, vi.fn())
    f.emit({ type: 'remove', tabId: 1 })
    f.emit({ type: 'upsert', tab: { id: 2, url: B } })
    resolveQuery([{ id: 1, url: A }])
    await flush()
    expect(f.service.getSnapshot(A)).toBe(false)
    expect(f.service.getSnapshot(B)).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })

  it('updates navigation and removes inaccessible/invalid URLs without scanning subscriptions', async () => {
    const f = setup()
    const changed = vi.fn()
    const other = Array.from({ length: 10_000 }, (_, i) => {
      const listener = vi.fn()
      f.service.subscribe(`https://other.example/${i}`, listener)
      return listener
    })
    f.service.subscribe(A, changed)
    f.service.subscribe(B, vi.fn())
    await flush()
    f.emit({ type: 'upsert', tab: { id: 1, url: A } })
    f.emit({ type: 'upsert', tab: { id: 1, url: A } })
    expect(changed).toHaveBeenCalledTimes(1)
    f.emit({ type: 'upsert', tab: { id: 1, url: B } })
    expect(f.service.getSnapshot(A)).toBe(false)
    expect(f.service.getSnapshot(B)).toBe(true)
    f.emit({ type: 'upsert', tab: { id: 1 } })
    expect(f.service.getSnapshot(B)).toBe(false)
    f.emit({ type: 'upsert', tab: { id: 2, url: 'not a URL' } })
    expect(f.service.getSnapshot('not a URL')).toBe(false)
    expect(f.query).toHaveBeenCalledTimes(1)
    expect(other.every((listener) => listener.mock.calls.length === 0)).toBe(
      true,
    )
  })

  it('keeps event lookup work constant with 10,000 subscribed saved URLs', async () => {
    const measureLookups = async (size: number) => {
      const f = setup()
      const stops = [f.service.subscribe(A, () => {})]
      for (let index = 0; index < size; index += 1) {
        stops.push(
          f.service.subscribe(`https://other.example/${index}`, () => {}),
        )
      }
      await flush()
      const get = vi.spyOn(Map.prototype, 'get')
      const keys = vi.spyOn(Map.prototype, 'keys')
      const values = vi.spyOn(Map.prototype, 'values')
      const entries = vi.spyOn(Map.prototype, 'entries')
      const forEach = vi.spyOn(Map.prototype, 'forEach')
      const iterator = vi.spyOn(Map.prototype, Symbol.iterator)
      f.emit({ type: 'upsert', tab: { id: 1, url: A } })
      const lookups = get.mock.calls.length
      const scans =
        keys.mock.calls.length +
        values.mock.calls.length +
        entries.mock.calls.length +
        forEach.mock.calls.length +
        iterator.mock.calls.length
      get.mockRestore()
      keys.mockRestore()
      values.mockRestore()
      entries.mockRestore()
      forEach.mockRestore()
      iterator.mockRestore()
      for (const stop of stops) {
        stop()
      }
      expect(scans).toBe(0)
      expect(lookups).toBeGreaterThan(0)
      return lookups
    }
    expect(await measureLookups(10_000)).toBe(await measureLookups(1))
  })

  it('contains query and subscribe failures without blocking saved URL operations', async () => {
    const f = setup(Promise.reject(new Error('private browser diagnostic')))
    f.service.subscribe(A, vi.fn())
    await flush()
    expect(f.service.getSnapshot(A)).toBe(false)
    f.emit({ type: 'upsert', tab: { id: 1, url: A } })
    expect(f.service.getSnapshot(A)).toBe(true)
    const broken = createOpenSavedTabsService({
      query: vi.fn(),
      subscribe: () => {
        throw new Error('unavailable')
      },
    })
    expect(() => broken.subscribe(A, vi.fn())()).not.toThrow()
    expect(broken.getSnapshot(A)).toBe(false)
  })

  it('discards in-flight results after the last unsubscribe and starts a fresh observation', async () => {
    let resolveQuery: (tabs: readonly BrowserOpenTab[]) => void = () => {}
    const f = setup(
      new Promise((resolve) => {
        resolveQuery = resolve
      }),
    )
    const stop = f.service.subscribe(A, vi.fn())
    stop()
    stop()
    resolveQuery([{ id: 1, url: A }])
    await flush()
    expect(f.service.getSnapshot(A)).toBe(false)
    f.service.subscribe(A, vi.fn())
    await flush()
    expect(f.query).toHaveBeenCalledTimes(2)
    expect(f.service.getSnapshot(A)).toBe(true)
    expect(f.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

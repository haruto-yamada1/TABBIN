import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line import/no-relative-parent-imports -- exercise the native smoke's route wait and resource cleanup directly
import { waitForRoute } from '../../e2e/support/firefox-saved-tabs-page-harness'

type UpdatedListener = (
  id: number,
  changes: Record<string, unknown>,
  tab: chrome.tabs.Tab,
) => void

const tab = (id: number, url: string): chrome.tabs.Tab =>
  ({ id, url }) as chrome.tabs.Tab
const expectedUrl = 'moz-extension://fixture/app.html#/saved-tabs'

const createHarness = () => {
  const listeners = new Set<UpdatedListener>()
  const get = vi.fn(async (_id: number) => tab(7, 'about:blank'))
  const addListener = vi.fn((listener: UpdatedListener) => {
    listeners.add(listener)
  })
  const removeListener = vi.fn((listener: UpdatedListener) => {
    listeners.delete(listener)
  })
  vi.stubGlobal('browser', {
    tabs: { get, onUpdated: { addListener, removeListener } },
  })
  const emit = (id: number, url: string) => {
    for (const listener of listeners) {
      listener(id, { url }, tab(id, url))
    }
  }
  return { get, listeners, emit }
}

describe('Firefox Saved Tabs smoke route wait', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('finishes an already committed route and releases its listener and timer', async () => {
    const harness = createHarness()
    harness.get.mockResolvedValueOnce(tab(7, `${expectedUrl}?mode=custom`))

    await expect(waitForRoute(7, expectedUrl)).resolves.toBeUndefined()

    expect(harness.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for the selected tab and route, then releases all resources', async () => {
    const harness = createHarness()
    const completed = vi.fn()
    const pending = waitForRoute(7, expectedUrl)
    void pending.then(completed)
    await vi.advanceTimersByTimeAsync(0)
    harness.emit(8, expectedUrl)
    harness.emit(7, 'https://example.test/saved-tabs.html')
    await vi.advanceTimersByTimeAsync(0)
    expect(completed).not.toHaveBeenCalled()

    harness.emit(7, expectedUrl)
    await pending

    expect(harness.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with the tab and route after ten seconds and releases the listener', async () => {
    const harness = createHarness()
    const rejected = vi.fn()
    const pending = waitForRoute(7, expectedUrl)
    void pending.catch(rejected)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(rejected).toHaveBeenCalledOnce()
    await expect(pending).rejects.toThrow(
      `Tab 7 did not reach ${expectedUrl} within 10000 ms.`,
    )
    expect(harness.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up when the browser API throws before returning a promise', async () => {
    const harness = createHarness()
    const error = new Error('Browser context was destroyed')
    harness.get.mockImplementationOnce(() => {
      throw error
    })

    await expect(waitForRoute(7, expectedUrl)).rejects.toBe(error)

    expect(harness.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves a tab lookup error and releases its listener and timer', async () => {
    const harness = createHarness()
    const error = new Error('Tab no longer exists')
    harness.get.mockRejectedValueOnce(error)

    await expect(waitForRoute(7, expectedUrl)).rejects.toBe(error)

    expect(harness.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

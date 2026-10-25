import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NativeTitleStateDeps } from './saved-tab-title-state'

const mocked = vi.hoisted(() => ({
  readEnabled: vi.fn(async () => false),
  contains: vi.fn(async () => true),
  query: vi.fn(async () => []),
  executeScript: vi.fn(async () => []),
  sendMessage: vi.fn(async () => {}),
  get: vi.fn(async () => ({
    id: 2,
    url: 'https://example.com/',
    incognito: false,
  })),
  refresh: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  removed: vi.fn(),
  saved: vi.fn(async () => new Set<string>()),
  subscribe: vi.fn(),
  createState: vi.fn(),
}))
const createEvent = <Listener>(
  _signature?: Listener,
): {
  addListener: ReturnType<typeof vi.fn<(listener: Listener) => void>>
} => ({
  addListener: vi.fn<(listener: Listener) => void>(),
})
const api = {
  tabs: {
    query: mocked.query,
    get: mocked.get,
    sendMessage: mocked.sendMessage,
    onUpdated:
      createEvent<
        (
          id: number,
          change: { url?: string; title?: string; status?: string },
          tab: { id: number; url?: string },
        ) => void
      >(),
    onRemoved: createEvent<(id: number) => void>(),
    onActivated: createEvent<(info: { tabId: number }) => void>(),
  },
  scripting: { executeScript: mocked.executeScript },
  permissions: {
    contains: mocked.contains,
    onAdded: createEvent<() => void>(),
    onRemoved: createEvent<() => void>(),
  },
  storage: {
    onChanged:
      createEvent<(changes: Record<string, unknown>, area: string) => void>(),
  },
}
vi.mock('wxt/browser', () => ({ browser: api }))
vi.mock('@/lib/storage/saved-tab-title-indicator', () => ({
  readSavedTabTitleEnabled: mocked.readEnabled,
}))
vi.mock('@/app/composition/nativeTitleIndicator', () => ({
  readNativeTitleSavedUrls: mocked.saved,
  subscribeNativeTitleSavedChanges: mocked.subscribe,
}))
vi.mock('./saved-tab-title-state', () => ({
  createSavedTabTitleState: mocked.createState,
}))
const first = <Listener>(event: {
  addListener: ReturnType<typeof vi.fn<(listener: Listener) => void>>
}): Listener => {
  const listener = event.addListener.mock.calls[0]?.[0]
  if (!listener) {
    throw new Error('listener missing')
  }
  return listener
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocked.readEnabled.mockResolvedValue(false)
  mocked.contains.mockResolvedValue(true)
  mocked.get.mockResolvedValue({
    id: 2,
    url: 'https://example.com/',
    incognito: false,
  })
  mocked.createState.mockReturnValue({
    refresh: mocked.refresh,
    update: mocked.update,
    removed: mocked.removed,
  })
})
describe('native title background lifecycle', () => {
  it('registers synchronous wake listeners once and reacts only to relevant tab/storage changes', async () => {
    const module = await import('./saved-tab-title-indicator')
    module.registerSavedTabTitleIndicator()
    module.registerSavedTabTitleIndicator()
    expect(api.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1)
    expect(mocked.refresh).toHaveBeenCalledTimes(1)
    const update = first(api.tabs.onUpdated)
    update(1, {}, { id: 1 })
    expect(mocked.update).not.toHaveBeenCalled()
    update(1, { url: 'https://example.com/' }, { id: 1 })
    update(1, { title: 'New' }, { id: 1 })
    update(1, { status: 'complete' }, { id: 1 })
    expect(mocked.update).toHaveBeenCalledTimes(3)
    first(api.tabs.onRemoved)(1)
    expect(mocked.removed).toHaveBeenCalledWith(1)
    first(api.permissions.onAdded)()
    first(api.permissions.onRemoved)()
    const storage = first(api.storage.onChanged)
    storage({ savedTabTitleIndicatorEnabled: { newValue: true } }, 'sync')
    storage({ other: true }, 'local')
    expect(mocked.refresh).toHaveBeenCalledTimes(3)
    storage({ savedTabTitleIndicatorEnabled: { newValue: true } }, 'local')
    expect(mocked.refresh).toHaveBeenCalledTimes(4)
    const invalidate = mocked.subscribe.mock.calls[0]?.[0]
    invalidate()
    expect(mocked.refresh).toHaveBeenCalledTimes(5)
    await module.refreshSavedTabTitleIndicator()
    expect(mocked.refresh).toHaveBeenCalledTimes(6)
  })

  it('keeps browser lifecycle registration alive if the optional notification transport fails', async () => {
    mocked.subscribe.mockImplementationOnce(() => {
      throw new Error('transport unavailable')
    })
    const module = await import('./saved-tab-title-indicator')
    expect(() => module.registerSavedTabTitleIndicator()).not.toThrow()
    expect(api.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1)
    expect(mocked.refresh).toHaveBeenCalledTimes(1)
  })

  it('rechecks an activated tab and safely handles tabs closed before get completes', async () => {
    const module = await import('./saved-tab-title-indicator')
    module.registerSavedTabTitleIndicator()
    const activate = first(api.tabs.onActivated)
    activate({ tabId: 2 })
    await Promise.resolve()
    expect(mocked.update).toHaveBeenCalledWith({
      id: 2,
      url: 'https://example.com/',
      incognito: false,
    })
    mocked.get.mockRejectedValueOnce(new Error('tab closed'))
    activate({ tabId: 3 })
    await Promise.resolve()
  })

  it('requires explicit local opt-in plus confirmed optional permissions and wires only reviewed script/messages', async () => {
    await import('./saved-tab-title-indicator')
    const deps: NativeTitleStateDeps = mocked.createState.mock.calls[0]?.[0]
    expect(await deps.readEnabled()).toBe(false)
    expect(mocked.contains).not.toHaveBeenCalled()
    mocked.readEnabled.mockResolvedValue(true)
    mocked.contains.mockResolvedValue(false)
    expect(await deps.readEnabled()).toBe(false)
    mocked.contains.mockResolvedValue(true)
    expect(await deps.readEnabled()).toBe(true)
    expect(mocked.contains).toHaveBeenLastCalledWith({
      permissions: ['scripting'],
      origins: ['http://*/*', 'https://*/*'],
    })
    await deps.queryTabs()
    expect(mocked.query).toHaveBeenCalledWith({})
    await deps.readSavedUrls()
    expect(mocked.saved).toHaveBeenCalled()
    await deps.apply(5, 'https://example.com/')
    expect(mocked.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 5 },
        args: [true, 'https://example.com/'],
      }),
    )
    await deps.restore(5)
    expect(mocked.sendMessage).toHaveBeenCalledExactlyOnceWith(5, {
      action: 'tabbinNativeSavedTitle',
      command: 'restore',
    })
  })
})

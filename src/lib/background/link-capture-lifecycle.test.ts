import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(async () => ({ enabled: true })),
  contains: vi.fn(async () => true),
  getScripts: vi.fn<() => Promise<chrome.scripting.RegisteredContentScript[]>>(
    async () => [],
  ),
  register: vi.fn(async () => {}),
  unregister: vi.fn(async () => {}),
  query: vi.fn(async () => [
    { id: 1, url: 'https://example.com/' },
    { id: 2, url: 'chrome://extensions/' },
    { id: 3, url: 'http://localhost/' },
  ]),
  execute: vi.fn(async () => []),
  send: vi.fn(async () => {}),
}))

const event = () => ({ addListener: vi.fn() })
const api = {
  scripting: {
    getRegisteredContentScripts: mocks.getScripts,
    registerContentScripts: mocks.register,
    unregisterContentScripts: mocks.unregister,
    executeScript: mocks.execute,
  },
  tabs: { query: mocks.query, sendMessage: mocks.send },
  permissions: {
    contains: mocks.contains,
    onAdded: event(),
    onRemoved: event(),
  },
  runtime: { onInstalled: event(), onStartup: event() },
  storage: { onChanged: event() },
}
vi.mock('wxt/browser', () => ({ browser: api }))
vi.mock('@/lib/storage/link-capture-settings', () => ({
  readLinkCaptureSettings: mocks.enabled,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.enabled.mockResolvedValue({ enabled: true })
  mocks.contains.mockResolvedValue(true)
  mocks.getScripts.mockResolvedValue([])
})

describe('link capture browser lifecycle', () => {
  it('registers listeners synchronously once and injects only into ordinary open pages', async () => {
    const { registerLinkCaptureLifecycle } =
      await import('./link-capture-lifecycle')
    registerLinkCaptureLifecycle()
    registerLinkCaptureLifecycle()
    expect(api.permissions.onRemoved.addListener).toHaveBeenCalledTimes(1)
    expect(api.runtime.onStartup.addListener).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1))
    expect(mocks.register).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'tabbin-link-capture',
        js: ['content-scripts/content.js'],
        matches: ['http://*/*', 'https://*/*'],
        allFrames: false,
        persistAcrossSessions: true,
      }),
    ])
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls).toEqual([
      [{ target: { tabId: 1 }, files: ['/content-scripts/content.js'] }],
      [{ target: { tabId: 3 }, files: ['/content-scripts/content.js'] }],
    ])
  })

  it('revocation unregisters a persisted script and disposes running page listeners', async () => {
    const { registerLinkCaptureLifecycle } =
      await import('./link-capture-lifecycle')
    registerLinkCaptureLifecycle()
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    mocks.contains.mockResolvedValue(false)
    mocks.getScripts.mockResolvedValue([
      { id: 'tabbin-link-capture', js: ['old.js'] },
    ])
    api.permissions.onRemoved.addListener.mock.calls[0]?.[0]()
    await vi.waitFor(() =>
      expect(mocks.unregister).toHaveBeenCalledWith({
        ids: ['tabbin-link-capture'],
      }),
    )
    expect(mocks.send).toHaveBeenCalledWith(1, { action: 'linkCaptureDispose' })
    expect(mocks.send).toHaveBeenCalledWith(3, { action: 'linkCaptureDispose' })
  })

  it('ignores unrelated storage and synchronizes settings changes without re-registering a matching script', async () => {
    mocks.getScripts.mockResolvedValue([
      {
        id: 'tabbin-link-capture',
        js: ['content-scripts/content.js'],
        matches: ['http://*/*', 'https://*/*'],
        allFrames: false,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ])
    const { registerLinkCaptureLifecycle } =
      await import('./link-capture-lifecycle')
    registerLinkCaptureLifecycle()
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.register).not.toHaveBeenCalled()
    const changed = api.storage.onChanged.addListener.mock.calls[0]?.[0]
    changed({ unrelated: {} }, 'local')
    changed({ linkCaptureSettings: {} }, 'sync')
    expect(mocks.enabled).toHaveBeenCalledTimes(1)
    mocks.enabled.mockResolvedValue({ enabled: false })
    changed({ linkCaptureSettings: { newValue: { enabled: false } } }, 'local')
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
    expect(mocks.register).not.toHaveBeenCalled()
  })
})

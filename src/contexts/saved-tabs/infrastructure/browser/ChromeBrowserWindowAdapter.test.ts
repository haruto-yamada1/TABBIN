import { describe, expect, it, vi } from 'vitest'

import type { ChromeWindowsApiLike } from './ChromeBrowserWindowAdapter'
import { createChromeBrowserWindowAdapter } from './ChromeBrowserWindowAdapter'

const createSpyWindows = (
  resolvedTabs: readonly { readonly url?: string }[] = [
    { url: 'https://example.com/a' },
    { url: 'https://example.com/b' },
  ],
): {
  readonly api: ChromeWindowsApiLike
  readonly create: ReturnType<typeof vi.fn>
} => {
  const create = vi.fn(async () => ({ tabs: resolvedTabs }))
  const api: ChromeWindowsApiLike = {
    windows: {
      create,
    },
  }
  return { api, create }
}

describe('createChromeBrowserWindowAdapter', () => {
  it('chrome.windows.create を focused=true で呼び出す', async () => {
    const { api, create } = createSpyWindows()
    const adapter = createChromeBrowserWindowAdapter({ getApi: () => api })

    const result = await adapter.openWithUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(create).toHaveBeenCalledWith({
      focused: true,
      url: ['https://example.com/a', 'https://example.com/b'],
    })
    expect(result.urls).toStrictEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
  })

  it('focused を false で呼び出せる', async () => {
    const { api, create } = createSpyWindows()
    const adapter = createChromeBrowserWindowAdapter({ getApi: () => api })

    await adapter.openWithUrls({
      focused: false,
      urls: ['https://example.com/a'],
    })

    expect(create).toHaveBeenCalledWith({
      focused: false,
      url: ['https://example.com/a'],
    })
  })

  it('resolveFocused オプションが既定値を上書きする', async () => {
    const { api, create } = createSpyWindows()
    const adapter = createChromeBrowserWindowAdapter(
      { getApi: () => api },
      { resolveFocused: () => false },
    )

    await adapter.openWithUrls({ urls: ['https://example.com/a'] })

    expect(create).toHaveBeenCalledWith({
      focused: false,
      url: ['https://example.com/a'],
    })
  })

  it('chrome.windows が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserWindowAdapter({ getApi: () => ({}) })

    await expect(
      adapter.openWithUrls({ urls: ['https://example.com'] }),
    ).rejects.toThrow('chrome.windows.create is not available')
  })

  it('chrome が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => undefined,
    })

    await expect(
      adapter.openWithUrls({ urls: ['https://example.com'] }),
    ).rejects.toThrow('chrome.windows.create is not available')
  })

  it('windows.create が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({ windows: {} }),
    })

    await expect(
      adapter.openWithUrls({ urls: ['https://example.com'] }),
    ).rejects.toThrow('chrome.windows.create is not available')
  })

  it('タブ URL が空の場合は入力 URL 配列をフォールバックとして返す', async () => {
    const { api } = createSpyWindows([])
    const adapter = createChromeBrowserWindowAdapter({ getApi: () => api })

    const result = await adapter.openWithUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(result.urls).toStrictEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
  })
})

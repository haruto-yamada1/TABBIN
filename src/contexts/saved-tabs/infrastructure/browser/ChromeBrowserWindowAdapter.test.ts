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
    ).rejects.toThrow('The browser is unavailable.')
  })

  it('chrome が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => undefined,
    })

    await expect(
      adapter.openWithUrls({ urls: ['https://example.com'] }),
    ).rejects.toThrow('The browser is unavailable.')
  })

  it('windows.create が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({ windows: {} }),
    })

    await expect(
      adapter.openWithUrls({ urls: ['https://example.com'] }),
    ).rejects.toThrow('The browser is unavailable.')
  })

  it('確認できなかった URL は成功一覧に含めない', async () => {
    const { api } = createSpyWindows([{ url: 'https://example.com/a' }])
    const adapter = createChromeBrowserWindowAdapter({ getApi: () => api })
    expect(
      await adapter.openWithUrls({
        urls: ['https://example.com/a', 'https://example.com/b'],
      }),
    ).toStrictEqual({ urls: ['https://example.com/a'] })
    const empty = createChromeBrowserWindowAdapter({
      getApi: () => createSpyWindows([]).api,
    })
    expect(
      await empty.openWithUrls({ urls: ['https://example.com/a'] }),
    ).toStrictEqual({ urls: [] })
  })

  it('作成結果が未確認の場合は成功扱いしない', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({ windows: { create: async () => undefined } }),
    })
    await expect(
      adapter.openWithUrls({ urls: ['https://example.com/a'] }),
    ).rejects.toThrow('The browser could not open this URL.')
  })

  it('canonical URL と pending URL を要求 URL に対応付ける', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({
        windows: {
          create: async () => ({
            tabs: [
              { url: 'https://example.com/' },
              { pendingUrl: 'https://other.example/' },
            ],
          }),
        },
      }),
    })
    expect(
      await adapter.openWithUrls({
        urls: ['https://example.com', 'https://other.example'],
      }),
    ).toStrictEqual({ urls: ['https://example.com', 'https://other.example'] })
  })

  it('1つの作成タブで複数の正規化同値URLを成功扱いしない', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({
        windows: {
          create: async () => ({
            tabs: [
              {
                url: 'https://example.com/',
                pendingUrl: 'https://other.example/',
              },
            ],
          }),
        },
      }),
    })
    const result = await adapter.openWithUrls({
      urls: [
        'https://example.com',
        'https://example.com/',
        'https://other.example',
      ],
    })
    expect(result.urls).toStrictEqual(['https://example.com'])
  })
})

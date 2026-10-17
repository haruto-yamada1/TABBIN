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
  const create = vi.fn(async () => ({
    tabs: resolvedTabs.map((tab, index) => ({ id: index + 1, index, ...tab })),
  }))
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

  it('about:blankの作成タブも一意なIDとindexで要求URLに対応付ける', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({
        windows: {
          create: async () => ({
            tabs: [
              { id: 12, index: 1, url: 'about:blank' },
              { id: 11, index: 0, url: 'about:blank' },
            ],
          }),
        },
      }),
    })
    await expect(
      adapter.openWithUrls({
        urls: ['https://example.com/a', 'https://example.com/b'],
      }),
    ).resolves.toStrictEqual({
      urls: ['https://example.com/a', 'https://example.com/b'],
    })
  })

  it('欠落したIDや重複IDでは複数の要求を成功扱いしない', async () => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({
        windows: {
          create: async () => ({
            tabs: [
              { id: 11, index: 0 },
              { id: 11, index: 1 },
              { index: 2, url: 'https://example.com/c' },
            ],
          }),
        },
      }),
    })
    await expect(
      adapter.openWithUrls({
        urls: [
          'https://example.com/a',
          'https://example.com/b',
          'https://example.com/c',
        ],
      }),
    ).resolves.toStrictEqual({ urls: ['https://example.com/a'] })
  })

  it.each([
    { id: -1, index: 0 },
    { id: Number.NaN, index: 0 },
    { id: 1.5, index: 0 },
    { id: 1, index: -1 },
    { id: 1, index: 1.5 },
    { id: 1, index: 1 },
  ])('不正な作成メタデータは成功扱いしない: %j', async (tab) => {
    const adapter = createChromeBrowserWindowAdapter({
      getApi: () => ({ windows: { create: async () => ({ tabs: [tab] }) } }),
    })
    await expect(
      adapter.openWithUrls({ urls: ['https://example.com/a'] }),
    ).resolves.toStrictEqual({ urls: [] })
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
              { id: 1, index: 0, url: 'https://example.com/' },
              { id: 2, index: 1, pendingUrl: 'https://other.example/' },
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
                id: 1,
                index: 0,
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

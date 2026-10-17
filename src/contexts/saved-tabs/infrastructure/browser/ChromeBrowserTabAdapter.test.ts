import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChromeBrowserTabAdapter } from './ChromeBrowserTabAdapter'
import type { ChromeApiLike, ChromeTabsLike } from './ChromeBrowserTabAdapter'

const createMockTabs = (
  impl?: NonNullable<ChromeTabsLike['create']>,
): NonNullable<ChromeTabsLike['create']> =>
  impl ??
  vi.fn(async (createProperties) => ({
    url: createProperties.url,
  }))

const createMockApi = (tabs?: ChromeTabsLike): ChromeApiLike => ({
  tabs: tabs ?? { create: createMockTabs() },
})

describe('createChromeBrowserTabAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('chrome.tabs.create に委譲して url を返す', async () => {
    const create = vi.fn(async (props) => ({ url: props.url }))
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({ create }),
    })
    const result = await adapter.open({ url: 'https://example.com' })
    expect(create).toHaveBeenCalledWith({
      active: true,
      url: 'https://example.com',
    })
    expect(result).toStrictEqual({ url: 'https://example.com' })
  })

  it('targets the confirmed window when appending a staged batch', async () => {
    const create = vi.fn(async (props) => ({ url: props.url }))
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({ create }),
    })
    await adapter.open({ url: 'https://example.com/a', windowId: 42 })
    expect(create).toHaveBeenCalledWith({
      active: true,
      url: 'https://example.com/a',
      windowId: 42,
    })
  })

  it('resolveActive が false を返すときは active: false で開く', async () => {
    const create = vi.fn(async (props) => ({ url: props.url }))
    const adapter = createChromeBrowserTabAdapter(
      { getApi: () => createMockApi({ create }) },
      { resolveActive: () => false },
    )
    await adapter.open({ url: 'https://example.com/page' })
    expect(create).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/page',
    })
  })

  it('作成したタブの URL が未取得でも入力 URL を返す', async () => {
    const create = vi.fn(async () => ({}))
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({ create }),
    })
    const result = await adapter.open({ url: 'https://example.com' })
    expect(result).toStrictEqual({ url: 'https://example.com' })
  })

  it('作成直後のabout:blankではなく確認済み要求URLを返す', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () =>
        createMockApi({ create: async () => ({ id: 7, url: 'about:blank' }) }),
    })
    await expect(
      adapter.open({ url: 'https://example.com/a' }),
    ).resolves.toStrictEqual({ url: 'https://example.com/a' })
  })

  it('作成結果が未確認の場合は成功扱いしない', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({ create: vi.fn(async () => undefined) }),
    })
    await expect(adapter.open({ url: 'https://example.com' })).rejects.toThrow(
      'The browser could not open this URL.',
    )
  })

  it.each([
    ['Permission denied', 'permission'],
    ['Illegal URL: https://secret.example/?token=hidden', 'restrictedUrl'],
    ['Too many tabs', 'tabLimit'],
    ['private diagnostic https://secret.example', 'unknown'],
  ])('browser rejection is safely classified: %s', async (message, reason) => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () =>
        createMockApi({
          create: async () => {
            throw new Error(message)
          },
        }),
    })
    await expect(
      adapter.open({ url: 'https://example.com' }),
    ).rejects.toMatchObject({ reason })
    await expect(
      adapter.open({ url: 'https://example.com' }),
    ).rejects.not.toThrow(message)
  })

  it('chrome API がない環境では Error を投げる', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => undefined,
    })
    await expect(adapter.open({ url: 'https://example.com' })).rejects.toThrow(
      'The browser is unavailable.',
    )
  })

  it('chrome.tabs.create が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({}),
    })
    await expect(adapter.open({ url: 'https://example.com' })).rejects.toThrow(
      'The browser is unavailable.',
    )
  })
})

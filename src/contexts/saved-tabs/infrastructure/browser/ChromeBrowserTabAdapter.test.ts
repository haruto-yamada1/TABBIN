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

  it('chrome.tabs.create の戻り url が undefined のとき入力 url を返す', async () => {
    const create = vi.fn(async () => undefined)
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({ create }),
    })
    const result = await adapter.open({ url: 'https://example.com' })
    expect(result).toStrictEqual({ url: 'https://example.com' })
  })

  it('chrome API がない環境では Error を投げる', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => undefined,
    })
    await expect(adapter.open({ url: 'https://example.com' })).rejects.toThrow(
      'chrome.tabs.create is not available',
    )
  })

  it('chrome.tabs.create が無い環境では Error を投げる', async () => {
    const adapter = createChromeBrowserTabAdapter({
      getApi: () => createMockApi({}),
    })
    await expect(adapter.open({ url: 'https://example.com' })).rejects.toThrow(
      'chrome.tabs.create is not available',
    )
  })
})

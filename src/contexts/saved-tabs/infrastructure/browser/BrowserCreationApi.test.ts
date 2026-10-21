import { afterEach, describe, expect, it, vi } from 'vitest'

import { getBrowserCreationApi } from './BrowserCreationApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Promise browser creation API', () => {
  it('prefers the Firefox Promise namespace without invoking either API', () => {
    const browserApi = {
      tabs: { create: vi.fn() },
      windows: { create: vi.fn() },
    }
    const chromeApi = { tabs: { create: vi.fn() } }
    vi.stubGlobal('browser', browserApi)
    vi.stubGlobal('chrome', chromeApi)
    expect(getBrowserCreationApi()).toBe(browserApi)
    expect(browserApi.tabs.create).not.toHaveBeenCalled()
    expect(chromeApi.tabs.create).not.toHaveBeenCalled()
  })

  it('uses native Chrome promises where the browser namespace is absent', () => {
    const chromeApi = { tabs: { create: vi.fn() } }
    vi.stubGlobal('browser', undefined)
    vi.stubGlobal('chrome', chromeApi)
    expect(getBrowserCreationApi()).toBe(chromeApi)
  })

  it('fails closed for an invalid or absent namespace', () => {
    vi.stubGlobal('browser', null)
    vi.stubGlobal('chrome', { tabs: { create: vi.fn() } })
    expect(getBrowserCreationApi()).toBeUndefined()
    vi.stubGlobal('browser', undefined)
    vi.stubGlobal('chrome', undefined)
    expect(getBrowserCreationApi()).toBeUndefined()
  })
})

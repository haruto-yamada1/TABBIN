import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeSavedTabTitles } from './normalize-saved-tab-titles'
import { NATIVE_SAVED_TAB_TITLE_ACTION } from './saved-tab-title'

const proof = vi.hoisted(() => vi.fn())
vi.mock('./prove-unmarked-tab-title', () => ({
  proveCapturedTitleUnowned: proof,
}))

const url = 'https://example.test/article#section'
const readMessage = {
  action: NATIVE_SAVED_TAB_TITLE_ACTION,
  command: 'read',
}
const readResult = {
  baseTitle: 'Site title',
  displayTitle: '✓ Site title',
  url,
}
const capturedTab = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  incognito: false,
  url,
  title: '✓ Site title',
  ...overrides,
})
const sendMessage = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('browser', undefined)
  vi.stubGlobal('chrome', { tabs: { sendMessage } })
  sendMessage.mockResolvedValue(readResult)
  proof.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('normalizeSavedTabTitles', () => {
  it('uses the owned base title and preserves metadata without mutating capture', async () => {
    const tab = Object.freeze(capturedTab({ windowId: 3, pinned: true }))
    const tabs = [tab]
    const result = await normalizeSavedTabTitles(tabs)

    expect(result).toEqual([{ ...tab, title: 'Site title' }])
    expect(tab.title).toBe('✓ Site title')
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(10, readMessage, {
      frameId: 0,
    })
  })

  it('preserves a prefix belonging to the original site title', async () => {
    const tab = capturedTab({ title: '✓ ✓ Site title' })
    sendMessage.mockResolvedValue({
      ...readResult,
      baseTitle: '✓ Site title',
      displayTitle: '✓ ✓ Site title',
    })

    expect(await normalizeSavedTabTitles([tab])).toEqual([
      { ...tab, title: '✓ Site title' },
    ])
  })

  it('accepts an empty original title', async () => {
    sendMessage.mockResolvedValue({
      ...readResult,
      baseTitle: '',
      displayTitle: '✓',
    })
    expect(await normalizeSavedTabTitles([capturedTab()])).toEqual([
      capturedTab({ title: '' }),
    ])
  })

  it('prefers the Firefox browser Promise API', async () => {
    const browserSendMessage = vi.fn().mockResolvedValue(readResult)
    vi.stubGlobal('browser', { tabs: { sendMessage: browserSendMessage } })
    await normalizeSavedTabTitles([capturedTab()])

    expect(browserSendMessage).toHaveBeenCalledExactlyOnceWith(
      10,
      readMessage,
      { frameId: 0 },
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('falls back to the Chrome Promise API if browser tabs messaging is unavailable', async () => {
    vi.stubGlobal('browser', { tabs: {} })
    expect(await normalizeSavedTabTitles([capturedTab()])).toEqual([
      capturedTab({ title: 'Site title' }),
    ])
    expect(sendMessage).toHaveBeenCalledOnce()
  })

  it.each([undefined, {}, { tabs: {} }, { tabs: { sendMessage: false } }])(
    'returns the same capture if messaging API is unavailable: %j',
    async (api) => {
      vi.stubGlobal('chrome', api)
      const tabs = [capturedTab()]
      expect(await normalizeSavedTabTitles(tabs)).toBe(tabs)
      expect(sendMessage).not.toHaveBeenCalled()
    },
  )

  it('does not query an empty capture', async () => {
    expect(await normalizeSavedTabTitles([])).toEqual([])
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    { incognito: true },
    { incognito: undefined },
    { id: undefined },
    { id: -1 },
    { id: 1.5 },
    { id: Number.NaN },
    { url: undefined },
    { url: 'chrome://settings' },
    { url: 'about:blank' },
    { url: 'moz-extension://extension/saved-tabs.html' },
    { url: 'file:///private/example' },
    { url: 'data:text/html,example' },
    // eslint-disable-next-line eslint/no-script-url -- Rejected input fixture.
    { url: 'javascript:void(0)' },
    { url: 'https://' },
    { url: 'not a url' },
  ])(
    'does not query a private, unknown or ineligible tab: %j',
    async (overrides) => {
      const tabs = [capturedTab(overrides)]
      expect(await normalizeSavedTabTitles(tabs)).toEqual(tabs)
      expect(sendMessage).not.toHaveBeenCalled()
    },
  )

  it.each([
    undefined,
    null,
    'Site title',
    [],
    {},
    { baseTitle: 'Site title', displayTitle: '✓ Site title' },
    { ...readResult, baseTitle: false },
    { ...readResult, displayTitle: 1 },
    { ...readResult, url: false },
    { ...readResult, extra: true },
    Object.assign(Object.create(readResult), { a: 1, b: 2, c: 3 }),
  ])(
    'preserves capture when the read response is absent, malformed or stale: %j',
    async (response) => {
      const tabs = [capturedTab()]
      sendMessage.mockResolvedValue(response)

      expect(await normalizeSavedTabTitles(tabs)).toEqual(tabs)
      expect(tabs[0]?.title).toBe('✓ Site title')
    },
  )

  it('preserves unmarked titles and never strips a site-owned checkmark', async () => {
    const tabs = [capturedTab({ title: '✓ Site-owned title' })]
    sendMessage.mockRejectedValue(new Error('No receiving end'))

    expect(await normalizeSavedTabTitles(tabs)).toEqual(tabs)
  })

  it('isolates per-tab message errors and retains tab order', async () => {
    const tabs = [
      capturedTab(),
      capturedTab({ id: 11 }),
      capturedTab({ id: 12 }),
    ]
    sendMessage
      .mockResolvedValueOnce(readResult)
      .mockRejectedValueOnce(new Error('Tab disappeared'))
      .mockResolvedValueOnce({ ...readResult, baseTitle: 'Updated site title' })

    expect(await normalizeSavedTabTitles(tabs)).toEqual([
      { ...tabs[0], title: 'Site title' },
      tabs[1],
      { ...tabs[2], title: 'Updated site title' },
    ])
  })

  it('handles synchronous messaging failures without logging page data', async () => {
    const log = vi.spyOn(console, 'log')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    sendMessage.mockImplementation(() => {
      throw new Error(`${url}?secret=private`)
    })
    const tabs = [capturedTab()]

    expect(await normalizeSavedTabTitles(tabs)).toEqual(tabs)
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it.each([
    { ...readResult, url: `${url}-other` },
    { ...readResult, url: 'https://example.test/article#another-section' },
  ])(
    'rejects an owned response from a newer navigation: %j',
    async (response) => {
      sendMessage.mockResolvedValue(response)
      await expect(
        normalizeSavedTabTitles([capturedTab()]),
      ).rejects.toMatchObject({
        name: 'NativeSavedTabTitleCaptureError',
        code: 'NATIVE_SAVED_TAB_TITLE_CAPTURE_UNAVAILABLE',
      })
      expect(proof).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, null, {}, { ...readResult, extra: true }])(
    'rejects an ambiguous captured prefix when an absent/malformed response has no unowned proof: %j',
    async (response) => {
      proof.mockResolvedValue(false)
      sendMessage.mockResolvedValue(response)
      await expect(
        normalizeSavedTabTitles([capturedTab()]),
      ).rejects.toMatchObject({
        code: 'NATIVE_SAVED_TAB_TITLE_CAPTURE_UNAVAILABLE',
      })
    },
  )

  it.each(['✓ Old document', '✓'])(
    'rejects an unverified prefix after a read error: %s',
    async (title) => {
      proof.mockResolvedValue(false)
      sendMessage.mockRejectedValue(new Error('private URL must not leak'))
      await expect(
        normalizeSavedTabTitles([capturedTab({ title })]),
      ).rejects.toMatchObject({
        message:
          'Native saved-tab title could not be verified. Retry saving the tab.',
      })
    },
  )

  it('rejects an ambiguous capture when messaging is unavailable and ownership is unknown', async () => {
    vi.stubGlobal('chrome', undefined)
    proof.mockResolvedValue(false)
    await expect(
      normalizeSavedTabTitles([capturedTab()]),
    ).rejects.toMatchObject({
      code: 'NATIVE_SAVED_TAB_TITLE_CAPTURE_UNAVAILABLE',
    })
  })

  it('keeps an ordinary title if messaging fails without needing ownership proof', async () => {
    proof.mockResolvedValue(false)
    sendMessage.mockRejectedValue(new Error('Tab closed'))
    const tabs = [capturedTab({ title: 'Ordinary site title' })]
    expect(await normalizeSavedTabTitles(tabs)).toEqual(tabs)
    expect(proof).not.toHaveBeenCalled()
  })
})

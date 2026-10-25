import { describe, expect, it } from 'vitest'

import { isTrustedExtensionPageSender } from './trusted-extension-sender'

const runtime = {
  getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  id: 'extension-id',
}
const sender = { id: runtime.id, url: runtime.getURL('app.html') }

describe('trusted extension page sender', () => {
  it.each([
    'app',
    'options',
    'saved-tabs',
    'ai-chat',
    'periodic-execution',
    'changelog',
  ])('allows the top-level %s document with route and query state', (page) => {
    expect(
      isTrustedExtensionPageSender(
        {
          ...sender,
          frameId: 0,
          origin: 'chrome-extension://extension-id',
          tab: { id: 123, incognito: false },
          url: runtime.getURL(`${page}.html?state=1#/saved-tabs`),
        },
        runtime,
      ),
    ).toBe(true)
  })

  it('uses runtime.getURL for the Firefox origin, independently of runtime.id', () => {
    const firefoxRuntime = {
      getURL: (path: string) => `moz-extension://generated-uuid/${path}`,
      id: 'extension@example.org',
    }
    expect(
      isTrustedExtensionPageSender(
        {
          id: firefoxRuntime.id,
          origin: 'moz-extension://generated-uuid',
          url: firefoxRuntime.getURL('app.html'),
        },
        firefoxRuntime,
      ),
    ).toBe(true)
  })

  it.each([
    undefined,
    null,
    'sender',
    {},
    { ...sender, id: '' },
    { ...sender, url: 123 },
    { ...sender, url: 'invalid URL' },
    { ...sender, url: 'chrome-extension://extension-id/assets/app.js' },
    { ...sender, url: 'chrome-extension://extension-id/app.html/extra' },
    { ...sender, url: 'chrome-extension://user:pass@extension-id/app.html' },
    { ...sender, url: 'chrome-extension://extension-id:12/app.html' },
    { ...sender, frameId: -1 },
    { ...sender, origin: 'null' },
    { ...sender, tab: null },
    { ...sender, tab: { incognito: true } },
  ])('rejects invalid or non-page senders: %j', (value) => {
    expect(isTrustedExtensionPageSender(value, runtime)).toBe(false)
  })

  it.each([
    undefined,
    null,
    {},
    { ...runtime, id: '' },
    { ...runtime, getURL: undefined },
    { ...runtime, getURL: () => undefined },
    { ...runtime, getURL: () => 'invalid URL' },
    { ...runtime, getURL: () => 'https://extension-id/' },
    { ...runtime, getURL: () => 'chrome-extension:///' },
    {
      ...runtime,
      getURL: () => {
        throw new Error('unavailable')
      },
    },
  ])(
    'fails closed when the current extension origin is unavailable: %j',
    (value) => {
      expect(isTrustedExtensionPageSender(sender, value)).toBe(false)
    },
  )

  it('fails closed on malformed sender objects', () => {
    const inaccessibleSender = new Proxy(
      {},
      {
        get: () => {
          throw new Error('untrusted')
        },
      },
    )
    expect(isTrustedExtensionPageSender(inaccessibleSender, runtime)).toBe(
      false,
    )
  })
})

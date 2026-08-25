import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

type GlobalWithBrowserApis = Omit<typeof globalThis, 'browser' | 'chrome'> & {
  browser?: unknown
  chrome?: {
    runtime?: {
      connect?: (connectInfo?: { name?: string }) => unknown
      sendMessage?: (
        message: unknown,
        callback?: (response: unknown) => void,
      ) => void
    }
  }
}

const globalWithApis = globalThis as GlobalWithBrowserApis
const originalBrowser = globalWithApis.browser
const originalChrome = globalWithApis.chrome

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('webextension-polyfill')
  globalWithApis.browser = originalBrowser
  if (originalChrome === undefined) {
    delete globalWithApis.chrome
  } else {
    globalWithApis.chrome = originalChrome
  }
})

describe('sendRuntimeMessage の追加分岐', () => {
  it('polyfill の import 失敗時は undefined を返す', async () => {
    vi.doMock('webextension-polyfill', () => {
      throw new Error('import failed')
    })

    delete globalWithApis.browser
    delete globalWithApis.chrome

    const { sendRuntimeMessage } = await import('./runtime')
    const response = await sendRuntimeMessage({ action: 'noop' })

    expect(response).toBeUndefined()
  })

  it('chrome.runtime.sendMessage が throw しても undefined を返す', async () => {
    vi.doMock('webextension-polyfill', () => ({
      default: {
        runtime: {
          sendMessage: vi.fn().mockRejectedValue(new Error('polyfill failed')),
        },
      },
    }))

    delete globalWithApis.browser
    globalWithApis.chrome = {
      runtime: {
        sendMessage: () => {
          throw new Error('chrome send failed')
        },
      },
    }

    const { sendRuntimeMessage } = await import('./runtime')
    const response = await sendRuntimeMessage({ action: 'noop' })

    expect(response).toBeUndefined()
  })

  it('polyfill が default export を返さない場合は undefined を返す', async () => {
    vi.doMock('webextension-polyfill', () => ({}))

    delete globalWithApis.browser
    delete globalWithApis.chrome

    const { sendRuntimeMessage } = await import('./runtime')
    const response = await sendRuntimeMessage({ action: 'noop' })

    expect(response).toBeUndefined()
  })

  it('connect できる runtime が無ければ null を返す', async () => {
    vi.doMock('webextension-polyfill', () => ({
      default: {
        runtime: {},
      },
    }))

    delete globalWithApis.browser
    delete globalWithApis.chrome

    const { connectRuntimePort } = await import('./runtime')
    const port = await connectRuntimePort('ai-chat-stream')

    expect(port).toBeNull()
  })

  it('connect 用の polyfill import 失敗時も null を返す', async () => {
    vi.doMock('webextension-polyfill', () => {
      throw new Error('import failed')
    })

    delete globalWithApis.browser
    delete globalWithApis.chrome

    const { connectRuntimePort } = await import('./runtime')
    const port = await connectRuntimePort('ai-chat-stream')

    expect(port).toBeNull()
  })

  it('chrome.runtime.connect が throw しても null を返す', async () => {
    vi.doMock('webextension-polyfill', () => ({
      default: {
        runtime: {},
      },
    }))

    delete globalWithApis.browser
    globalWithApis.chrome = {
      runtime: {
        connect: () => {
          throw new Error('connect failed')
        },
      },
    }

    const { connectRuntimePort } = await import('./runtime')
    const port = await connectRuntimePort('ai-chat-stream')

    expect(port).toBeNull()
  })
})

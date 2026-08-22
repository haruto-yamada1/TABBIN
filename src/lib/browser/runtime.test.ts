import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const { polyfillConnectMock, polyfillSendMessageMock } = vi.hoisted(() => ({
  polyfillConnectMock: vi.fn(),
  polyfillSendMessageMock: vi.fn(),
}))

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      connect: polyfillConnectMock,
      sendMessage: polyfillSendMessageMock,
    },
  },
}))

import { connectRuntimePort, sendRuntimeMessage } from './runtime'

type GlobalWithBrowserApis = Omit<typeof globalThis, 'browser' | 'chrome'> & {
  browser?: {
    runtime?: {
      connect?: (connectInfo?: { name?: string }) => unknown
      sendMessage?: (message: unknown) => Promise<unknown>
    }
  }
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

describe('sendRuntimeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    polyfillConnectMock.mockImplementation(() => undefined)
    polyfillSendMessageMock.mockRejectedValue(
      new Error('polyfill runtime unavailable'),
    )
    delete globalWithApis.browser
    delete globalWithApis.chrome
  })

  afterEach(() => {
    if (originalBrowser === undefined) {
      delete globalWithApis.browser
    } else {
      globalWithApis.browser = originalBrowser
    }
    if (originalChrome === undefined) {
      delete globalWithApis.chrome
    } else {
      globalWithApis.chrome = originalChrome
    }
  })

  it('browser.runtime.sendMessage がある場合は Promise API を使う', async () => {
    const browserSendMessage = vi
      .fn()
      .mockResolvedValue({ status: 'ok-from-browser' })
    globalWithApis.browser = {
      runtime: {
        sendMessage: browserSendMessage,
      },
    }

    const response = await sendRuntimeMessage({
      action: 'settingsImported',
    })

    expect(browserSendMessage).toHaveBeenCalledWith({
      action: 'settingsImported',
    })
    expect(response).toStrictEqual({ status: 'ok-from-browser' })
  })

  it('browser.runtime がない場合は chrome.runtime.sendMessage にフォールバックする', async () => {
    const chromeSendMessage = vi.fn(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ status: 'ok-from-chrome' })
      },
    )

    globalWithApis.chrome = {
      runtime: {
        sendMessage: chromeSendMessage,
      },
    }

    const response = await sendRuntimeMessage({
      action: 'settingsImported',
    })

    expect(chromeSendMessage).toHaveBeenCalledWith(
      { action: 'settingsImported' },
      expect.any(Function),
    )
    expect(response).toStrictEqual({ status: 'ok-from-chrome' })
  })

  it('polyfill API を読み込んだ後はキャッシュを再利用する', async () => {
    polyfillSendMessageMock.mockResolvedValue({ status: 'ok-from-polyfill' })

    const [first, second] = await sendRuntimeMessage({
      action: 'first',
    }).then(async (firstResponse) => [
      firstResponse,
      await sendRuntimeMessage({
        action: 'second',
      }),
    ])

    expect(first).toStrictEqual({ status: 'ok-from-polyfill' })
    expect(second).toStrictEqual({ status: 'ok-from-polyfill' })
    expect(polyfillSendMessageMock).toHaveBeenNthCalledWith(1, {
      action: 'first',
    })
    expect(polyfillSendMessageMock).toHaveBeenNthCalledWith(2, {
      action: 'second',
    })
  })

  it('browser.runtime.connect がある場合は Port API を使う', async () => {
    const browserConnect = vi.fn().mockReturnValue({
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
    })
    globalWithApis.browser = {
      runtime: {
        connect: browserConnect,
      },
    }

    const port = await connectRuntimePort('ai-chat-stream')

    expect(browserConnect).toHaveBeenCalledWith({
      name: 'ai-chat-stream',
    })
    expect(port).toBeTruthy()
  })

  it('browser.runtime.connect がない場合は chrome.runtime.connect にフォールバックする', async () => {
    const chromeConnect = vi.fn().mockReturnValue({
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
    })
    globalWithApis.chrome = {
      runtime: {
        connect: chromeConnect,
      },
    }

    const port = await connectRuntimePort('ai-chat-stream')

    expect(chromeConnect).toHaveBeenCalledWith({
      name: 'ai-chat-stream',
    })
    expect(port).toBeTruthy()
  })

  it('polyfill runtime.connect が返せる場合はその Port を使う', async () => {
    const polyfillPort = {
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
    }
    polyfillConnectMock.mockReturnValue(polyfillPort)

    const port = await connectRuntimePort('ai-chat-stream')

    expect(polyfillConnectMock).toHaveBeenCalledWith({
      name: 'ai-chat-stream',
    })
    expect(port).toBe(polyfillPort)
  })
})

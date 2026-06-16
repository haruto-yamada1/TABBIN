import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHROME_MESSAGING_ADAPTER_MARKER } from '../../application/ports/MessagingPort'
import type { ExternalDragMessage } from '../../application/ports/MessagingPort'
import type { ChromeApiLike } from './ChromeMessagingAdapter'
import { createChromeMessagingAdapter } from './ChromeMessagingAdapter'

const createMockApi = (
  impl?: (message: ExternalDragMessage) => void,
  lastError?: { readonly message?: string },
): ChromeApiLike => ({
  runtime: {
    lastError,
    sendMessage: vi.fn(
      (
        message: ExternalDragMessage,
        callback?: (response: { status: string }) => void,
      ) => {
        if (impl) {
          impl(message)
        }
        callback?.({ status: 'ok' })
      },
    ),
  },
})

describe('createChromeMessagingAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('CHROME_MESSAGING_ADAPTER_MARKER を port に立てる', () => {
    const adapter = createChromeMessagingAdapter({
      getApi: () => createMockApi(),
    })
    expect(adapter[CHROME_MESSAGING_ADAPTER_MARKER]).toBe(true)
  })

  it('chrome.runtime.sendMessage 経由で urlDragStarted を送信する', async () => {
    const sendMessage = vi.fn(
      (
        message: ExternalDragMessage,
        callback?: (response: { status: string }) => void,
      ) => {
        expect(message).toStrictEqual({
          action: 'urlDragStarted',
          groupId: 'group-1',
          url: 'https://example.com',
        })
        callback?.({ status: 'ok' })
      },
    )
    const api: ChromeApiLike = { runtime: { sendMessage } }
    const adapter = createChromeMessagingAdapter({ getApi: () => api })
    const response = await adapter.send({
      action: 'urlDragStarted',
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(response).toStrictEqual({ status: 'ok' })
  })

  it('chrome.runtime.sendMessage 経由で fromExternal 付き urlDropped を送信する', async () => {
    const sendMessage = vi.fn(
      (
        message: ExternalDragMessage,
        callback?: (response: { status: string }) => void,
      ) => {
        expect(message).toStrictEqual({
          action: 'urlDropped',
          fromExternal: true,
          groupId: 'group-1',
          url: 'https://example.com',
        })
        callback?.({ status: 'removed' })
      },
    )
    const api: ChromeApiLike = { runtime: { sendMessage } }
    const adapter = createChromeMessagingAdapter({ getApi: () => api })
    const response = await adapter.send({
      action: 'urlDropped',
      fromExternal: true,
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(response).toStrictEqual({ status: 'removed' })
  })

  it('chrome.runtime.lastError があるときは undefined を返す', async () => {
    // chrome.runtime.sendMessage が lastError を報告する経路では
    // adapter が warn ログを出す。setup-console.ts が `console.warn` を
    // 検知してテスト失敗にするため、本ケースだけスタブする。
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sendMessage = vi.fn(
      (
        _message: ExternalDragMessage,
        callback?: (response: { status: string }) => void,
      ) => {
        callback?.({ status: 'ok' })
      },
    )
    const api: ChromeApiLike = {
      runtime: {
        lastError: { message: 'Receiving end does not exist' },
        sendMessage,
      },
    }
    const adapter = createChromeMessagingAdapter({ getApi: () => api })
    const response = await adapter.send({
      action: 'urlDragStarted',
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(response).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('chrome API がない環境では undefined を返し reject しない', async () => {
    const adapter = createChromeMessagingAdapter({ getApi: () => undefined })
    const response = await adapter.send({
      action: 'urlDragStarted',
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(response).toBeUndefined()
  })

  it('chrome.runtime.sendMessage がない環境では undefined を返す', async () => {
    const api: ChromeApiLike = { runtime: {} }
    const adapter = createChromeMessagingAdapter({ getApi: () => api })
    const response = await adapter.send({
      action: 'urlDragStarted',
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(response).toBeUndefined()
  })
})

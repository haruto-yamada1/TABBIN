import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSonnerNotificationAdapter } from './SonnerNotificationAdapter'
import type { SonnerNotificationAdapterDeps } from './SonnerNotificationAdapter'

interface ToastMock {
  error: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
}

const createMockToast = (): ToastMock => {
  return {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}

describe('createSonnerNotificationAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('info / success / error が対応する toast メソッドに委譲される', () => {
    const mockToast = createMockToast()
    const port = createSonnerNotificationAdapter({
      toastOverride:
        mockToast as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.info({ message: 'info message' })
    port.success({ message: 'success message' })
    port.error({ message: 'error message' })
    expect(mockToast.info).toHaveBeenCalledWith('info message')
    expect(mockToast.success).toHaveBeenCalledWith('success message')
    expect(mockToast.error).toHaveBeenCalledWith('error message')
  })

  it('action を含む場合は sonner の action オプションに渡される', () => {
    const mockToast = createMockToast()
    const onClick = vi.fn()
    const port = createSonnerNotificationAdapter({
      toastOverride:
        mockToast as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.info({ action: { label: 'Undo', onClick }, message: 'removed' })
    const call = mockToast.info.mock.calls[0]
    expect(call?.[0]).toBe('removed')
    const action = call?.[1]?.action as
      | { label: string; onClick: () => void }
      | undefined
    expect(action?.label).toBe('Undo')
    action?.onClick()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('action.onClick が失敗しても port 全体が throw しない', async () => {
    const mockToast = createMockToast()
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const port = createSonnerNotificationAdapter({
      toastOverride:
        mockToast as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.error({
      action: {
        label: 'retry',
        onClick: () => {
          throw new Error('boom')
        },
      },
      message: 'failed',
    })
    const call = mockToast.error.mock.calls[0]
    const action = call?.[1]?.action as
      | { label: string; onClick: () => void }
      | undefined
    // action.onClick() は内部で throw を吸収するため同期呼び出しでも例外を投げない
    expect(() => action?.onClick()).not.toThrow()
    // microtask: 内部 Promise の catch が resolve するのを待つ
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalled()
        resolve()
      }, 0)
    })
  })

  it('action.onClick が reject する Promise を返しても port 全体が throw しない', async () => {
    const mockToast = createMockToast()
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const port = createSonnerNotificationAdapter({
      toastOverride:
        mockToast as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.info({
      action: {
        label: 'retry',
        onClick: () => Promise.reject(new Error('async-boom')),
      },
      message: 'failed',
    })
    const call = mockToast.info.mock.calls[0]
    const action = call?.[1]?.action as
      | { label: string; onClick: () => void }
      | undefined
    expect(() => action?.onClick()).not.toThrow()
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalled()
        resolve()
      }, 0)
    })
  })

  it('toast が無い場合 error は console.error にフォールバックする', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const port = createSonnerNotificationAdapter({
      toastOverride: {
        error: undefined,
        info: undefined,
        success: undefined,
      } as unknown as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.error({ message: 'failed without toast' })
    expect(errorSpy).toHaveBeenCalledWith('failed without toast')
  })

  it('toast が無い場合 info は console.warn にフォールバックする', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    const port = createSonnerNotificationAdapter({
      toastOverride: {
        error: undefined,
        info: undefined,
        success: undefined,
      } as unknown as SonnerNotificationAdapterDeps['toastOverride'],
    })
    port.info({ message: 'informational' })
    expect(warnSpy).toHaveBeenCalledWith('informational')
  })

  it('deps を省略した場合は sonner の toast を使う', () => {
    const port = createSonnerNotificationAdapter()
    // toast が見つからない環境では console へフォールバックすることを許容しつつ、
    // ここでは throw せず関数として呼び出せることを確認する。
    expect(() => port.info({ message: 'no-deps' })).not.toThrow()
  })
})

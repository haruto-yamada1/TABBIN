import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'

import { useSavedTabsStorageSync } from './useSavedTabsStorageSync'

const hint: TypedSavedTabsStorageChange = {
  key: 'urls',
  kind: 'noPayload',
  oldValue: undefined,
  newValue: { revision: 2 },
}
const createPort = () => {
  let listener: Parameters<StorageChangePort['subscribe']>[0] = () => {}
  const unsubscribe = vi.fn()
  const port: StorageChangePort = {
    subscribe: (callback) => {
      listener = callback
      return unsubscribe
    },
  }
  return { port, unsubscribe, emit: () => listener([hint]) }
}

describe('useSavedTabsStorageSync', () => {
  it('waits for initial loading, then subscribes and repairs commits missed during loading', async () => {
    const { port } = createPort()
    const subscribe = vi.spyOn(port, 'subscribe')
    const synchronize = vi.fn(async () => {})
    const { rerender } = renderHook(
      ({ ready }) => useSavedTabsStorageSync(port, synchronize, ready),
      { initialProps: { ready: false } },
    )
    expect(subscribe).not.toHaveBeenCalled()
    expect(synchronize).not.toHaveBeenCalled()
    rerender({ ready: true })
    await waitFor(() => expect(synchronize).toHaveBeenCalledOnce())
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('subscribes before querying and coalesces deliveries while a query is in flight', async () => {
    const { port, emit } = createPort()
    const held = Promise.withResolvers<undefined>()
    const synchronize = vi
      .fn(async () => {})
      .mockImplementationOnce(async () => held.promise)
    const subscribe = vi.spyOn(port, 'subscribe')
    renderHook(() => useSavedTabsStorageSync(port, synchronize))
    expect(subscribe.mock.invocationCallOrder[0]).toBeLessThan(
      synchronize.mock.invocationCallOrder[0] ?? 0,
    )
    act(() => {
      emit()
      emit()
      emit()
    })
    expect(synchronize).toHaveBeenCalledTimes(1)
    await act(async () => held.resolve(undefined))
    await waitFor(() => expect(synchronize).toHaveBeenCalledTimes(2))
    expect(synchronize.mock.calls[1]).toEqual([[hint]])
  })

  it('recovers a failed query on focus and does not subscribe again when callbacks change', async () => {
    const { port } = createPort()
    const synchronize = vi.fn(async (): Promise<void> => {
      throw new Error('private query failure')
    })
    const refreshed = vi.fn(async () => {})
    const subscribe = vi.spyOn(port, 'subscribe')
    const { rerender } = renderHook(
      ({ callback }) => useSavedTabsStorageSync(port, callback),
      { initialProps: { callback: synchronize } },
    )
    await waitFor(() => expect(synchronize).toHaveBeenCalledOnce())
    rerender({ callback: refreshed })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(refreshed).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('refreshes on becoming visible, and stops queued/lifecycle work after unmount', async () => {
    const { port, emit, unsubscribe } = createPort()
    const synchronize = vi.fn(async () => {})
    const { unmount } = renderHook(() =>
      useSavedTabsStorageSync(port, synchronize),
    )
    await waitFor(() => expect(synchronize).toHaveBeenCalledOnce())
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(synchronize).toHaveBeenCalledOnce()
    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(synchronize).toHaveBeenCalledTimes(2)
    const held = Promise.withResolvers<undefined>()
    synchronize.mockImplementationOnce(async () => held.promise)
    act(() => {
      emit()
      emit()
    })
    unmount()
    await act(async () => {
      held.resolve(undefined)
      emit()
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(synchronize).toHaveBeenCalledTimes(3)
    expect(unsubscribe).toHaveBeenCalledOnce()
    visibility.mockRestore()
  })
})

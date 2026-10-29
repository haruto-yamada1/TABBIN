import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SavedTabsSearchHistoryPort } from '@/contexts/saved-tabs/application/ports/SavedTabsSearchHistoryPort'

import { useSearchHistory } from './useSearchHistory'

afterEach(() => {
  vi.useRealTimers()
})

const delayedSchedule =
  (
    record: SavedTabsSearchHistoryPort['record'],
  ): SavedTabsSearchHistoryPort['schedule'] =>
  async (query, signal) =>
    new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', cancel)
        void record(query).then(resolve, reject)
      }, 1200)
      const cancel = () => {
        clearTimeout(timer)
        reject(new DOMException('cancelled', 'AbortError'))
      }
      signal.addEventListener('abort', cancel, { once: true })
    })

const createPort = (entries: string[] = []) => {
  const record = vi.fn(async (query: string) => [query])
  return {
    read: vi.fn(async () => entries),
    record,
    schedule: vi.fn(delayedSchedule(record)),
    remove: vi.fn(async () => []),
    subscribe: vi.fn(
      (_listener: (removed: readonly string[]) => void) => () => {},
    ),
  } satisfies SavedTabsSearchHistoryPort
}

describe('search history recording', () => {
  it('records settled queries, avoids IME fragments, and only cancels deletion of the current query', async () => {
    vi.useFakeTimers()
    const port = createPort()
    const { rerender, result } = renderHook(
      ({ query, composing }) => useSearchHistory(port, query, composing),
      { initialProps: { query: '', composing: false } },
    )
    await act(async () => {})
    rerender({ query: 'you', composing: false })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    rerender({ query: 'youtube', composing: false })
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(port.record).toHaveBeenCalledOnce()
    expect(port.record).toHaveBeenCalledWith('youtube')
    rerender({ query: 'ごは', composing: true })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(port.record).toHaveBeenCalledOnce()
    rerender({ query: 'ごはん', composing: false })
    await act(async () => {
      await result.current.handleRemove('youtube')
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(port.record).toHaveBeenCalledTimes(2)
    expect(port.record).toHaveBeenLastCalledWith('ごはん')
    rerender({ query: '別の検索', composing: false })
    await act(async () => {
      await result.current.handleRemove('別の検索')
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(port.record).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer storage notification when the initial read finishes late', async () => {
    let resolveFirst!: (value: string[]) => void
    let notify!: (removed: readonly string[]) => void
    const port: SavedTabsSearchHistoryPort = {
      read: vi
        .fn()
        .mockImplementationOnce(
          async () =>
            new Promise<string[]>((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockResolvedValue(['new']),
      record: vi.fn(),
      schedule: vi.fn(),
      remove: vi.fn(),
      subscribe: vi.fn((listener) => {
        notify = listener
        return () => {}
      }),
    }
    const { result } = renderHook(() => useSearchHistory(port, '', false))
    act(() => notify([]))
    await waitFor(() => expect(result.current.entries).toEqual(['new']))
    await act(async () => resolveFirst(['old']))
    expect(result.current.entries).toEqual(['new'])
  })

  it('cancels a pending write when another page deletes the same query', async () => {
    vi.useFakeTimers()
    let notify!: (removed: readonly string[]) => void
    const port = createPort(['youtube'])
    port.subscribe.mockImplementation((listener) => {
      notify = listener
      return () => {}
    })
    const { rerender } = renderHook(
      ({ query }) => useSearchHistory(port, query, false),
      { initialProps: { query: '' } },
    )
    await act(async () => {})
    rerender({ query: 'youtube' })
    act(() => notify(['youtube']))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(port.record).not.toHaveBeenCalled()
  })

  it('does not schedule a deleted query while the initial history read is pending', async () => {
    vi.useFakeTimers()
    let notify!: (removed: readonly string[]) => void
    const port = createPort()
    port.read
      .mockImplementationOnce(async () => new Promise<string[]>(() => {}))
      .mockResolvedValue([])
    port.subscribe.mockImplementation((listener) => {
      notify = listener
      return () => {}
    })
    const { rerender } = renderHook(
      ({ query }) => useSearchHistory(port, query, false),
      { initialProps: { query: '' } },
    )
    rerender({ query: 'youtube' })
    await act(async () => {
      notify(['youtube'])
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(port.record).not.toHaveBeenCalled()
    rerender({ query: 'youtube again' })
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(port.record).toHaveBeenCalledWith('youtube again')
  })

  it('recovers from a transient write failure when a new query is entered', async () => {
    vi.useFakeTimers()
    const port = createPort()
    port.record.mockRejectedValueOnce(new Error('write failed'))
    const { result, rerender } = renderHook(
      ({ query }) => useSearchHistory(port, query, false),
      { initialProps: { query: '' } },
    )
    await act(async () => {})
    rerender({ query: 'first' })
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(result.current.error).toBe(true)
    rerender({ query: 'second' })
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(port.record).toHaveBeenLastCalledWith('second')
    expect(result.current.error).toBe(false)
  })

  it('reconnects after a transient subscription failure when a new query is entered', async () => {
    vi.useFakeTimers()
    const port = createPort()
    port.subscribe.mockImplementationOnce(() => {
      throw new Error('temporarily unavailable')
    })
    const { result, rerender } = renderHook(
      ({ query }) => useSearchHistory(port, query, false),
      { initialProps: { query: '' } },
    )
    expect(result.current.error).toBe(true)
    rerender({ query: 'second' })
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(port.subscribe).toHaveBeenCalledTimes(2)
    expect(port.record).toHaveBeenCalledWith('second')
    expect(result.current.error).toBe(false)
  })

  it('reports a scheduled write failure even if another page notified a change meanwhile', async () => {
    vi.useFakeTimers()
    let notify!: (removed: readonly string[]) => void
    const port = createPort()
    port.subscribe.mockImplementation((listener) => {
      notify = listener
      return () => {}
    })
    port.record.mockRejectedValueOnce(new Error('write failed'))
    const { result, rerender } = renderHook(
      ({ query }) => useSearchHistory(port, query, false),
      { initialProps: { query: '' } },
    )
    await act(async () => {})
    rerender({ query: 'search' })
    await act(async () => {
      vi.advanceTimersByTime(600)
      notify([])
    })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current.error).toBe(true)
  })

  it('reports read and delete failures without inventing a successful result', async () => {
    const port: SavedTabsSearchHistoryPort = {
      read: vi.fn().mockRejectedValue(new Error('read failed')),
      record: vi.fn(),
      schedule: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error('write failed')),
      subscribe: vi.fn(() => () => {}),
    }
    const { result } = renderHook(() => useSearchHistory(port, '', false))
    await waitFor(() => expect(result.current.error).toBe(true))
    await act(async () => {
      await expect(result.current.handleRemove('old')).rejects.toThrow(
        'write failed',
      )
    })
    expect(result.current.entries).toEqual([])
  })
})

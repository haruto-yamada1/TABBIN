import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  SavedSearch,
  SavedSearchesPort,
} from '@/contexts/saved-tabs/application/ports/SavedSearchesPort'

import { useSavedSearches } from './useSavedSearches'

const saved = { id: '1', name: 'Work', query: 'docs' }

describe('useSavedSearches', () => {
  it('does not replace newer storage updates with a delayed initial read', async () => {
    let resolveFirst!: (value: SavedSearch[]) => void
    let notify!: () => void
    const port: SavedSearchesPort = {
      list: vi
        .fn()
        .mockImplementationOnce(
          async () =>
            new Promise<SavedSearch[]>((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockResolvedValue([saved]),
      subscribe: vi.fn((listener) => {
        notify = listener
        return () => {}
      }),
      save: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
    }
    const { result } = renderHook(() => useSavedSearches(port))
    act(() => notify())
    await waitFor(() => expect(result.current.searches).toEqual([saved]))
    await act(async () => resolveFirst([]))
    expect(result.current.searches).toEqual([saved])
  })

  it('reports load failures and does not claim failed writes succeeded', async () => {
    const port: SavedSearchesPort = {
      list: vi.fn().mockRejectedValue(new Error('read failed')),
      subscribe: vi.fn(() => () => {}),
      save: vi.fn().mockRejectedValue(new Error('write failed')),
      rename: vi.fn(),
      remove: vi.fn(),
    }
    const { result } = renderHook(() => useSavedSearches(port))
    await waitFor(() => expect(result.current.loadError).toBe(true))
    await expect(result.current.handleSave('Work', 'docs')).rejects.toThrow(
      'write failed',
    )
    expect(result.current.searches).toEqual([])
  })
})

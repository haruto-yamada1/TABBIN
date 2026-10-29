import { KeyboardSensor, PointerSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSavedTabsSensors } from './useSavedTabsSensors'

describe('useSavedTabsSensors', () => {
  it('keeps pointer and default sortable keyboard navigation', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useSavedTabsSensors())
    expect(result.current.map(({ sensor }) => sensor)).toEqual([
      PointerSensor,
      KeyboardSensor,
    ])
    expect(result.current[1]?.options).toEqual({
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'smooth',
    })
  })

  it('tracks live reduced motion without changing custom hierarchical navigation', () => {
    const query = Object.assign(new EventTarget(), { matches: true })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    const coordinateGetter = vi.fn()
    const { result } = renderHook(() => useSavedTabsSensors(coordinateGetter))
    expect(result.current[1]?.options).toEqual({
      coordinateGetter,
      scrollBehavior: 'instant',
    })
    act(() => {
      query.matches = false
      query.dispatchEvent(new Event('change'))
    })
    expect(result.current[1]?.options).toEqual({
      coordinateGetter,
      scrollBehavior: 'smooth',
    })
  })
})

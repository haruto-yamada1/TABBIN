import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useReducedMotion } from './useReducedMotion'

describe('useReducedMotion', () => {
  it('reflects live OS changes and unsubscribes on unmount', () => {
    const query = Object.assign(new EventTarget(), { matches: false })
    const removeListener = vi.spyOn(query, 'removeEventListener')
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    const { result, unmount } = renderHook(useReducedMotion)
    expect(result.current).toBe(false)
    act(() => {
      query.matches = true
      query.dispatchEvent(new Event('change'))
    })
    expect(result.current).toBe(true)
    act(() => {
      query.matches = false
      query.dispatchEvent(new Event('change'))
    })
    expect(result.current).toBe(false)
    unmount()
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('keeps ordinary motion when media queries are unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(useReducedMotion)
    expect(result.current).toBe(false)
  })
})

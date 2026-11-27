import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  SavedTabsCardCollapseContext,
  useSavedTabsCardCollapse,
} from './useSavedTabsCardCollapse'

const renderCard = (policy: {
  collapseByDefault: boolean
  isSearching: boolean
}) =>
  renderHook(useSavedTabsCardCollapse, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SavedTabsCardCollapseContext value={policy}>
        {children}
      </SavedTabsCardCollapseContext>
    ),
  })

describe('useSavedTabsCardCollapse', () => {
  it('keeps a mounted card open when the list grows past the threshold', () => {
    const policy = { collapseByDefault: false, isSearching: false }
    const { result, rerender } = renderCard(policy)
    expect(result.current[0]).toBe(false)
    policy.collapseByDefault = true
    rerender()
    expect(result.current[0]).toBe(false)
  })

  it('opens search results without overwriting the browse choice', () => {
    const policy = { collapseByDefault: true, isSearching: false }
    const { result, rerender } = renderCard(policy)
    expect(result.current[0]).toBe(true)

    policy.isSearching = true
    rerender()
    expect(result.current[0]).toBe(false)

    policy.isSearching = false
    rerender()
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    policy.isSearching = true
    rerender()
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    policy.isSearching = false
    rerender()
    expect(result.current[0]).toBe(false)
  })
})

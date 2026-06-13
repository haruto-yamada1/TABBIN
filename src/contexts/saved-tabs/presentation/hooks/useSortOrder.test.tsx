// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest' // eslint-disable-line

import { useSortOrder } from './useSortOrder'

interface Item {
  domain: string
}

const items: Item[] = [
  { domain: 'zeta.example.com' },
  { domain: 'alpha.example.com' },
  { domain: 'beta.example.com' },
]

describe('useSortOrderフック', () => {
  it('デフォルトでは元の順序を返す', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    expect(result.current.sortOrder).toBe('default')
    expect(result.current.sortedItems).toStrictEqual(items)
  })

  it('sortOrder が asc のとき昇順に並べ替える', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    act(() => {
      result.current.setSortOrder('asc')
    })

    expect(result.current.sortedItems.map((item) => item.domain)).toStrictEqual(
      ['alpha.example.com', 'beta.example.com', 'zeta.example.com'],
    )
  })

  it('sortOrder が desc のとき降順に並べ替える', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    act(() => {
      result.current.setSortOrder('desc')
    })

    expect(result.current.sortedItems.map((item) => item.domain)).toStrictEqual(
      ['zeta.example.com', 'beta.example.com', 'alpha.example.com'],
    )
  })
})

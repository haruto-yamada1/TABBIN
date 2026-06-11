// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest' // eslint-disable-line

import { createCompoundContext } from './createCompoundContext'

describe('createCompoundContext', () => {
  it('Provider 配下の値を返し、Provider 外ではエラーにする', () => {
    const { context: Context, useCompoundContext } = createCompoundContext<{
      value: string
    }>('Sample')
    const wrapper = ({ children }: { children: ReactNode }) => (
      // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
      <Context value={{ value: 'provided' }}>{children}</Context>
    )

    expect(
      renderHook(() => useCompoundContext(), { wrapper }).result.current,
    ).toStrictEqual({
      value: 'provided',
    })
    expect(() => renderHook(() => useCompoundContext())).toThrow(
      'SampleのProvider内で使用してください',
    )
  })
})

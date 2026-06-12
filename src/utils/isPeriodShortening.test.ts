import { describe, expect, it } from 'vitest' // eslint-disable-line

import { isPeriodShortening } from './isPeriodShortening'

describe('isPeriodShortening 関数', () => {
  it('never からの変更を短縮として扱う', () => {
    expect(isPeriodShortening('never', '30days')).toBe(true)
  })

  it('never への変更を短縮として扱わない', () => {
    expect(isPeriodShortening('30days', 'never')).toBe(false)
  })

  it('新しい期間が短い場合は true を返す', () => {
    expect(isPeriodShortening('30days', '7days')).toBe(true)
    expect(isPeriodShortening('1day', '1hour')).toBe(true)
  })

  it('新しい期間が同じか長い場合は false を返す', () => {
    expect(isPeriodShortening('7days', '7days')).toBe(false)
    expect(isPeriodShortening('1hour', '1day')).toBe(false)
  })

  it('未知の値を安全に処理する', () => {
    expect(isPeriodShortening('unknown', '1day')).toBe(true)
    expect(isPeriodShortening('1day', 'unknown')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest' // eslint-disable-line

import { isPeriodShortening } from './isPeriodShortening'

describe('isPeriodShortening の追加ケース', () => {
  it('秒・分の期間を処理する', () => {
    expect(isPeriodShortening('1min', '30sec')).toBe(true)
    expect(isPeriodShortening('30sec', '1min')).toBe(false)
  })

  it('より長い期間の対応を処理する', () => {
    expect(isPeriodShortening('30days', '14days')).toBe(true)
    expect(isPeriodShortening('365days', '180days')).toBe(true)
    expect(isPeriodShortening('180days', '365days')).toBe(false)
  })
})

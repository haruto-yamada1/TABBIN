import { describe, expect, it } from 'vitest' // eslint-disable-line

import { formatLocalizedDate } from './date-format'

describe('formatLocalizedDate', () => {
  it('ja では日本語の年月日形式で返す', () => {
    expect(formatLocalizedDate('ja', '2026-03-14')).toBe('2026年3月14日')
  })

  it('en では英語の月日形式で返す', () => {
    expect(formatLocalizedDate('en', '2026-03-14')).toBe('March 14, 2026')
  })

  it('Date と timestamp と ISO 文字列を受け付ける', () => {
    expect(formatLocalizedDate('en', new Date(2026, 2, 14))).toBe(
      'March 14, 2026',
    )
    expect(formatLocalizedDate('ja', new Date(2026, 2, 14).getTime())).toBe(
      '2026年3月14日',
    )
    expect(formatLocalizedDate('en', '2026-03-14T00:00:00')).toBe(
      'March 14, 2026',
    )
  })
})

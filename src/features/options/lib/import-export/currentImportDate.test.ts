import { describe, expect, it } from 'vitest'

import { getCurrentUtcDateOnly } from './currentImportDate'

describe('getCurrentUtcDateOnly', () => {
  it('formats the injected clock as a UTC YYYY-MM-DD value', () => {
    expect(
      getCurrentUtcDateOnly(() => new Date('2026-08-31T23:59:59.999-07:00')),
    ).toBe('2026-09-01')
  })
})

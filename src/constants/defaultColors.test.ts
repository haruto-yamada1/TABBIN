import { describe, expect, it } from 'vitest' // eslint-disable-line

import { defaultColors, getDefaultColor } from './defaultColors'

describe('defaultColors', () => {
  it('既知キーと未知キーの両方を返せる', () => {
    expect(getDefaultColor('primary')).toBe(defaultColors.primary)
    expect(getDefaultColor('unknown-key')).toBe('#ffffff')
  })
})

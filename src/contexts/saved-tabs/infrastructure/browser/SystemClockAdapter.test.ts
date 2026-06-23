import { describe, expect, it, vi } from 'vitest'

import { createSystemClock } from './SystemClockAdapter'

describe('SystemClockAdapter', () => {
  it('Date.now() を呼び出して epoch ms を返す', () => {
    const clock = createSystemClock()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    expect(clock.now()).toBe(1_700_000_000_000)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('ClockPort interface に適合する', () => {
    const clock = createSystemClock()
    expect(clock.now).toBeTypeOf('function')
  })
})

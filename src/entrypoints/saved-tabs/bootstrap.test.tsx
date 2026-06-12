// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { redirectToApp } from './main'

describe('saved-tabs bootstrap', () => {
  it('redirect helper は mode を維持して app route を返す', () => {
    const replace = vi.fn()

    expect(redirectToApp('/saved-tabs.html', '?mode=custom', replace)).toBe(
      'app.html#/saved-tabs?mode=custom',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/saved-tabs?mode=custom')
  })

  it('mode 未指定なら共通入口の app route を返す', () => {
    const replace = vi.fn()

    expect(redirectToApp('/saved-tabs.html', '', replace)).toBe(
      'app.html#/saved-tabs',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/saved-tabs')
  })
})

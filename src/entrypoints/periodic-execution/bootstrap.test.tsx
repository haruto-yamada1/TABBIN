// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { redirectToApp } from './main'

describe('periodic-execution bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirect helper は app route を返す', () => {
    const replace = vi.fn()

    expect(redirectToApp('/periodic-execution.html', '', replace)).toBe(
      'app.html#/periodic-execution',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/periodic-execution')
  })
})

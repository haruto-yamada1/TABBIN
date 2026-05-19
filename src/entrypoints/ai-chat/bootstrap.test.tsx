// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { redirectToApp } from './main'

describe('ai-chat bootstrap', () => {
  it('redirect helper は ai-chat route を返す', () => {
    const replace = vi.fn()

    expect(redirectToApp('/ai-chat.html', '', replace)).toBe(
      'app.html#/ai-chat',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/ai-chat')
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { redirectToApp, syncDocumentTitle } from './main'

describe('options legacy redirect', () => {
  it('options.html から app.html の options route へ redirect する', () => {
    const replace = vi.fn()

    expect(redirectToApp('/options.html', '', replace)).toBe(
      'app.html#/options',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/options')
  })

  it('options.html の document title を同期する', () => {
    expect(syncDocumentTitle('/options.html', 'en-US')).toBe('Options - TABBIN')
    expect(document.title).toBe('Options - TABBIN')
  })
})

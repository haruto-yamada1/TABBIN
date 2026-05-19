// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { redirectToApp, syncDocumentTitle } from './main'

describe('periodic-execution legacy redirect', () => {
  it('periodic-execution.html から app.html の route へ redirect する', () => {
    const replace = vi.fn()

    expect(redirectToApp('/periodic-execution.html', '', replace)).toBe(
      'app.html#/periodic-execution',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/periodic-execution')
  })

  it('periodic-execution.html の document title を同期する', () => {
    expect(syncDocumentTitle('/periodic-execution.html', 'en-US')).toBe(
      'Scheduled tasks - TABBIN',
    )
    expect(document.title).toBe('Scheduled tasks - TABBIN')
  })
})

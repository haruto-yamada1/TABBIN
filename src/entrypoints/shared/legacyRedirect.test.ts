// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  initializeLegacyRedirect,
  redirectToApp,
  syncDocumentTitle,
} from './legacyRedirect'

describe('legacyRedirect', () => {
  it('document title を pathname と locale から同期する', () => {
    expect(syncDocumentTitle('/changelog.html', 'en-US')).toBe(
      'Release Notes - TABBIN',
    )
    expect(document.title).toBe('Release Notes - TABBIN')
  })

  it('legacy entrypoint を SPA href に置き換える', () => {
    const replace = vi.fn()

    expect(redirectToApp('/saved-tabs.html', '?mode=custom', replace)).toBe(
      'app.html#/saved-tabs?mode=custom',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/saved-tabs?mode=custom')
  })

  it('DOMContentLoaded で title 同期と redirect を実行する', () => {
    using addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const replace = vi.fn()

    initializeLegacyRedirect({ replace })

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'DOMContentLoaded',
      expect.any(Function),
    )

    const listener = addEventListenerSpy.mock.calls.at(-1)?.[1] as
      | (() => void)
      | undefined
    expect(listener).toBeDefined()

    listener?.()

    expect(document.title).toBe('TABBIN')
    expect(replace).toHaveBeenCalledWith('app.html#/saved-tabs')
  })

  it('replace 未指定でも DOMContentLoaded listener を登録する', () => {
    using addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    initializeLegacyRedirect()

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'DOMContentLoaded',
      expect.any(Function),
    )
  })
})

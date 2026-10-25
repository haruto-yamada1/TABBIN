import { createContext, runInContext } from 'node:vm'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  applySavedTabTitle,
  isCapturedTabTitleUnowned,
} from './saved-tab-title'

beforeEach(() => {
  document.title = '✓ Site-owned title'
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'tabbin',
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  applySavedTabTitle(false, location.href)
  document.title = ''
})

it('proves that an exact current site title has no isolated ownership state', () => {
  expect(isCapturedTabTitleUnowned(location.href, '✓ Site-owned title')).toBe(
    true,
  )
  expect(document.title).toBe('✓ Site-owned title')
})

it('rejects owned state without changing its title or listener', () => {
  applySavedTabTitle(true, location.href)
  expect(isCapturedTabTitleUnowned(location.href, '✓ ✓ Site-owned title')).toBe(
    false,
  )
  expect(document.title).toBe('✓ ✓ Site-owned title')
})

it('rejects changed URL, changed title and child frames', () => {
  expect(
    isCapturedTabTitleUnowned(`${location.href}#other`, document.title),
  ).toBe(false)
  expect(isCapturedTabTitleUnowned(location.href, '✓ Old document')).toBe(false)
  vi.stubGlobal('window', { top: {} })
  expect(isCapturedTabTitleUnowned(location.href, document.title)).toBe(false)
})

it('executes the read-only proof without any module closure', () => {
  const context = createContext({ window, document, location })
  expect(
    runInContext(
      `(${isCapturedTabTitleUnowned.toString()})(${JSON.stringify(location.href)}, ${JSON.stringify(document.title)})`,
      context,
    ),
  ).toBe(true)
})

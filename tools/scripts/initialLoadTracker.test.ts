import { afterEach, describe, expect, it, vi } from 'vitest'

import { InitialLoadTracker } from './initialLoadTracker'

afterEach(() => vi.useRealTimers())

describe('initial JS browser lifecycle', () => {
  it('waits for screen readiness, completed requests and the quiet window; deduplicates cache hits', () => {
    vi.useFakeTimers()
    const load = new InitialLoadTracker('moz-extension://example')
    load.started('1', 'moz-extension://example/chunks/app.js')
    load.parsed('moz-extension://example/chunks/app.js')
    vi.advanceTimersByTime(1000)
    expect(load.snapshot(true)).toBeNull()
    load.finished('1')
    vi.advanceTimersByTime(500)
    expect(load.snapshot(false)).toBeNull()
    expect(load.snapshot(true)).toEqual(['chunks/app.js'])
    load.started('2', 'moz-extension://example/chunks/app.js')
    load.started('3', 'moz-extension://example/chunks/route.js')
    load.finished('2')
    vi.advanceTimersByTime(1000)
    expect(load.snapshot(true)).toBeNull()
    load.parsed('moz-extension://example/chunks/app.js')
    load.parsed('moz-extension://example/chunks/route.js')
    load.finished('3')
    vi.advanceTimersByTime(500)
    expect(load.snapshot(true)).toEqual(['chunks/app.js', 'chunks/route.js'])
  })

  it('excludes other origins and non-JS requests and fails incomplete or failed JS loads', () => {
    vi.useFakeTimers()
    const load = new InitialLoadTracker('chrome-extension://test')
    load.started('remote', 'http://localhost/remote.js')
    load.started('css', 'chrome-extension://test/style.css')
    vi.advanceTimersByTime(1000)
    expect(load.snapshot(true)).toBeNull()
    load.started('js', 'chrome-extension://test/app.js')
    load.failed('js')
    expect(() => load.snapshot(true)).toThrow(
      'Initial JavaScript request failed',
    )
  })
})

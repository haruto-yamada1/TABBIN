// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  resolveSavedTabsViewModeHref,
  shouldWaitForInitialViewMode,
  syncSavedTabsViewModeLocation,
} from './viewModeNavigationService'

describe('viewModeNavigationService.resolveSavedTabsViewModeHref', () => {
  it('custom view mode のときは mode=custom の href を返す', () => {
    expect(resolveSavedTabsViewModeHref('custom')).toContain('mode=custom')
  })

  it('domain view mode のときは mode=domain の href を返す', () => {
    expect(resolveSavedTabsViewModeHref('domain')).toContain('mode=domain')
  })
})

describe('viewModeNavigationService.shouldWaitForInitialViewMode', () => {
  it('initialViewMode 未指定なら false', () => {
    expect(
      shouldWaitForInitialViewMode({
        hasResolvedInitialViewMode: false,
        viewMode: 'custom',
      }),
    ).toBe(false)
  })

  it('hasResolvedInitialViewMode が true なら false', () => {
    expect(
      shouldWaitForInitialViewMode({
        hasResolvedInitialViewMode: true,
        initialViewMode: 'domain',
        viewMode: 'custom',
      }),
    ).toBe(false)
  })

  it('viewMode が initialViewMode と一致しない場合は true', () => {
    expect(
      shouldWaitForInitialViewMode({
        hasResolvedInitialViewMode: false,
        initialViewMode: 'domain',
        viewMode: 'custom',
      }),
    ).toBe(true)
  })

  it('viewMode が initialViewMode と一致する場合は false', () => {
    expect(
      shouldWaitForInitialViewMode({
        hasResolvedInitialViewMode: false,
        initialViewMode: 'custom',
        viewMode: 'custom',
      }),
    ).toBe(false)
  })
})

describe('viewModeNavigationService.syncSavedTabsViewModeLocation', () => {
  const originalLocation = window.location
  const originalHistory = window.history
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // jsdom では window.location の書き換えが制限されているため、
    // テスト用に `replaceState` だけをモックして副作用を検証する。
    // `unbound-method` 警告を避けるため、spy は変数に保持して
    // そちらを expect 対象にする。
    replaceStateSpy = vi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(window.history as any, 'replaceState')
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    Object.defineProperty(window, 'history', {
      configurable: true,
      value: originalHistory,
    })
  })

  it('onViewModeNavigate が指定されていればそれを呼ぶ', () => {
    const onViewModeNavigate = vi.fn()
    syncSavedTabsViewModeLocation({
      onViewModeNavigate,
      viewMode: 'custom',
    })
    expect(onViewModeNavigate).toHaveBeenCalledWith('custom')
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('onViewModeNavigate 未指定で現在 URL と同じ場合は replaceState を呼ばない', () => {
    const currentUrl = new URL(
      'https://example.com/saved-tabs.html?mode=custom',
    )
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: currentUrl,
    })
    syncSavedTabsViewModeLocation({ viewMode: 'custom' })
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('onViewModeNavigate 未指定で現在 URL と異なる場合は replaceState を呼ぶ', () => {
    const currentUrl = new URL(
      'https://example.com/saved-tabs.html?mode=domain',
    )
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: currentUrl,
    })
    syncSavedTabsViewModeLocation({ viewMode: 'custom' })
    expect(replaceStateSpy).toHaveBeenCalled()
  })
})

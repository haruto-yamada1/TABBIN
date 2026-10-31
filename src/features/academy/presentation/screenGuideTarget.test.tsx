// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findVisibleGuideTarget, waitForGuideTarget } from './screenGuideTarget'

const rect = new DOMRect(0, 0, 80, 40)
const visibleRects = Object.assign([rect], {
  item: (index: number) => (index === 0 ? rect : null),
})
const emptyRects = Object.assign([], { item: () => null })

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(
    visibleRects,
  )
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const mount = () => {
  const target = document.createElement('button')
  target.dataset.tour = 'target'
  document.body.append(target)
  return target
}

describe('screen-guide dynamic targets', () => {
  it('selects a visible target instead of hidden duplicates', () => {
    const hidden = mount()
    hidden.hidden = true
    const invisible = mount()
    invisible.style.visibility = 'hidden'
    const removedFromLayout = mount()
    removedFromLayout.style.display = 'none'
    const visible = mount()
    expect(findVisibleGuideTarget('[data-tour="target"]')).toBe(visible)
    visible.remove()
    expect(findVisibleGuideTarget('[data-tour="target"]')).toBeNull()
  })

  it('requires layout visibility and waits for a later mount without changing the target', async () => {
    const abort = new AbortController()
    const pending = waitForGuideTarget('[data-tour="target"]', abort.signal)
    const target = mount()
    const click = vi.fn()
    target.addEventListener('click', click)
    await expect(pending).resolves.toBe(target)
    expect(click).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finds a target becoming visible from layout changes without DOM mutations', async () => {
    const target = mount()
    const geometry = vi
      .spyOn(target, 'getClientRects')
      .mockReturnValue(emptyRects)
    const pending = waitForGuideTarget(
      '[data-tour="target"]',
      new AbortController().signal,
    )
    geometry.mockReturnValue(visibleRects)
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toBe(target)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends a missing-target wait at the bound and releases its timers', async () => {
    const pending = waitForGuideTarget(
      '[data-tour="target"]',
      new AbortController().signal,
    )
    const failed = pending.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await failed).toEqual(new Error('Guide target unavailable'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([true, false])(
    'cancels an aborted wait (already aborted: %s)',
    async (alreadyAborted) => {
      const controller = new AbortController()
      if (alreadyAborted) {
        controller.abort()
      }
      const pending = waitForGuideTarget(
        '[data-tour="target"]',
        controller.signal,
      )
      const failed = pending.catch((error: unknown) => error)
      controller.abort()
      expect(await failed).toEqual(new Error('Guide target unavailable'))
      mount()
      await vi.advanceTimersByTimeAsync(4000)
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})

import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  SCROLL_TARGET_ATTRIBUTE,
  getRelativeScrollTarget,
  getScrollControlAvailability,
  scrollContainerToTarget,
} from './scroll-controls'

const mockTop = (element: Element, top: number) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top,
  } as DOMRect)
}

describe('scroll-controls', () => {
  it('最上部では上方向のターゲットを返さない', () => {
    const container = document.createElement('div')
    const firstTarget = document.createElement('div')

    firstTarget.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'parent')
    container.append(firstTarget)

    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      value: 0,
    })
    mockTop(container, 100)
    mockTop(firstTarget, 100)

    expect(getRelativeScrollTarget(container, 'parent', 'previous')).toBeNull()
  })

  it('下方向では sticky オフセット位置にある現在ターゲットを飛ばす', () => {
    const container = document.createElement('div')
    const currentTarget = document.createElement('div')
    const nextTarget = document.createElement('div')

    currentTarget.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'domain')
    nextTarget.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'domain')
    container.append(currentTarget, nextTarget)

    mockTop(container, 100)
    mockTop(currentTarget, 196)
    mockTop(nextTarget, 320)

    expect(getRelativeScrollTarget(container, 'domain', 'next')).toBe(
      nextTarget,
    )
  })

  it('最下部では下方向のターゲットを返さない', () => {
    const container = document.createElement('div')
    const lastTarget = document.createElement('div')

    lastTarget.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'child')
    container.append(lastTarget)

    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    mockTop(container, 100)
    mockTop(lastTarget, 260)

    expect(getRelativeScrollTarget(container, 'child', 'next')).toBeNull()
  })

  it('上方向では threshold より上にある最後の target を返す', () => {
    const container = document.createElement('div')
    const first = document.createElement('div')
    const previous = document.createElement('div')
    const current = document.createElement('div')
    for (const element of [first, previous, current]) {
      element.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'project')
      container.append(element)
    }
    Object.defineProperty(container, 'scrollTop', { value: 100 })
    mockTop(container, 100)
    mockTop(first, 120)
    mockTop(previous, 180)
    mockTop(current, 196)

    expect(getRelativeScrollTarget(container, 'project', 'previous')).toBe(
      previous,
    )
  })

  it('上方向に該当 target がなければ null を返す', () => {
    const container = document.createElement('div')
    const target = document.createElement('div')
    target.setAttribute(SCROLL_TARGET_ATTRIBUTE, 'domain')
    container.append(target)
    Object.defineProperty(container, 'scrollTop', { value: 100 })
    mockTop(container, 100)
    mockTop(target, 250)

    expect(getRelativeScrollTarget(container, 'domain', 'previous')).toBeNull()
  })

  it('各 target と上下 scroll の availability を返す', () => {
    const container = document.createElement('div')
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 500 },
      scrollTop: { value: 100 },
    })
    mockTop(container, 100)
    for (const type of ['child', 'domain', 'parent', 'project']) {
      const previous = document.createElement('div')
      const next = document.createElement('div')
      previous.setAttribute(SCROLL_TARGET_ATTRIBUTE, type)
      next.setAttribute(SCROLL_TARGET_ATTRIBUTE, type)
      container.append(previous, next)
      mockTop(previous, 150)
      mockTop(next, 300)
    }

    expect(getScrollControlAvailability(container)).toStrictEqual({
      bottom: true,
      nextChild: true,
      nextDomain: true,
      nextParent: true,
      nextProject: true,
      previousChild: true,
      previousDomain: true,
      previousParent: true,
      previousProject: true,
      top: true,
    })
  })

  it('非 scrollable container は上下 availability を返さない', () => {
    const container = document.createElement('div')
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 100 },
      scrollTop: { value: 0 },
    })
    mockTop(container, 100)

    expect(getScrollControlAvailability(container)).toStrictEqual({
      bottom: false,
      nextChild: false,
      nextDomain: false,
      nextParent: false,
      nextProject: false,
      previousChild: false,
      previousDomain: false,
      previousParent: false,
      previousProject: false,
      top: false,
    })
  })

  it.each([
    { targetTop: 50, expected: 0 },
    { targetTop: 250, expected: 154 },
    { targetTop: 1000, expected: 400 },
  ])(
    'target 位置を scroll 範囲内の $expected へ clamp する',
    ({ targetTop, expected }) => {
      const container = document.createElement('div')
      const target = document.createElement('div')
      const scrollTo = vi.fn()
      Object.defineProperties(container, {
        clientHeight: { value: 100 },
        scrollHeight: { value: 500 },
        scrollTop: { value: 100 },
        scrollTo: { value: scrollTo },
      })
      mockTop(container, 100)
      mockTop(target, targetTop)

      scrollContainerToTarget(container, target)

      expect(scrollTo).toHaveBeenCalledWith({
        behavior: 'smooth',
        top: expected,
      })
    },
  )
})

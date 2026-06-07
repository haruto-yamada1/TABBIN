import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  SCROLL_TARGET_ATTRIBUTE,
  getRelativeScrollTarget,
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
})

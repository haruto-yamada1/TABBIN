// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatSidebarResize } from './useChatSidebarResize'

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
}

const createResizeStartEvent = () => ({
  preventDefault: vi.fn(),
})

describe('useChatSidebarResize', () => {
  beforeEach(() => {
    setViewportWidth(1200)
    window.localStorage.clear()
    document.body.style.cssText = 'color: red;'
  })

  afterEach(() => {
    document.body.style.cssText = ''
  })

  it('restores and clamps the stored floating sidebar width', () => {
    setViewportWidth(600)
    window.localStorage.setItem('tabbin-ai-chat-sidebar-width', '900')

    const { result } = renderHook(() =>
      useChatSidebarResize({ mode: 'floating' }),
    )

    expect(result.current.sidebarWidth).toBe(552)
    expect(result.current.cardStyle).toEqual({ width: '552px' })
  })

  it('updates the floating sidebar width during pointer movement', () => {
    const { result } = renderHook(() =>
      useChatSidebarResize({ mode: 'floating' }),
    )
    const event = createResizeStartEvent()

    act(() => {
      result.current.handleResizeStart(event)
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 }))
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(result.current.sidebarWidth).toBe(500)
    expect(result.current.isResizing).toBe(true)
  })

  it('persists the final width and restores body styles on pointer up', () => {
    const { result } = renderHook(() =>
      useChatSidebarResize({ mode: 'floating' }),
    )

    act(() => {
      result.current.handleResizeStart(createResizeStartEvent())
    })
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 650 }))
      window.dispatchEvent(new PointerEvent('pointerup'))
    })

    expect(window.localStorage.getItem('tabbin-ai-chat-sidebar-width')).toBe(
      '550',
    )
    expect(result.current.isResizing).toBe(false)
    expect(document.body.style.cssText).toBe('color: red;')
  })

  it('removes pointer listeners and restores body styles on unmount', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() =>
      useChatSidebarResize({ mode: 'floating' }),
    )

    act(() => {
      result.current.handleResizeStart(createResizeStartEvent())
    })
    unmount()

    expect(document.body.style.cssText).toBe('color: red;')
    expect(removeEventListener).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    )
    expect(removeEventListener).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
    )
  })

  it('does not start sidebar resizing in page mode', () => {
    const { result } = renderHook(() => useChatSidebarResize({ mode: 'page' }))
    const event = createResizeStartEvent()

    act(() => {
      result.current.handleResizeStart(event)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 }))
    })

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(result.current.isResizing).toBe(false)
    expect(result.current.cardStyle).toBeUndefined()
    expect(document.body.style.cssText).toBe('color: red;')
  })
})

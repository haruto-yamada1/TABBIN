// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  loadSidebarWidth: vi.fn(() => 420),
  persistSidebarWidth: vi.fn(),
}))

vi.mock('@/features/ai-chat/components/savedTabsChat/storage', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/features/ai-chat/components/savedTabsChat/storage',
  )

  return {
    ...actual,
    loadSidebarWidth: mocked.loadSidebarWidth,
    persistSidebarWidth: mocked.persistSidebarWidth,
  }
})

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

type HookProps = {
  mode: 'floating' | 'page'
}

describe('useChatSidebarResize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.loadSidebarWidth.mockReturnValue(420)
    setViewportWidth(1200)
    document.body.style.cssText = 'color: red;'
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    document.body.style.cssText = ''
  })

  it('restores the clamped width returned by the storage accessor', () => {
    mocked.loadSidebarWidth.mockReturnValue(552)

    const { result } = renderHook(() =>
      useChatSidebarResize({ mode: 'floating' }),
    )

    expect(mocked.loadSidebarWidth).toHaveBeenCalledOnce()
    expect(result.current.sidebarWidth).toBe(552)
    expect(result.current.cardStyle).toEqual({ width: '552px' })
  })

  it('restores the saved width when the same instance changes from page to floating', () => {
    mocked.loadSidebarWidth.mockReturnValue(640)
    const initialProps: HookProps = { mode: 'page' }
    const { result, rerender } = renderHook(
      ({ mode }: HookProps) => useChatSidebarResize({ mode }),
      { initialProps },
    )

    rerender({ mode: 'floating' })

    expect(mocked.loadSidebarWidth).toHaveBeenCalledOnce()
    expect(result.current.sidebarWidth).toBe(640)
    expect(result.current.cardStyle).toEqual({ width: '640px' })
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

    expect(mocked.persistSidebarWidth).toHaveBeenCalledOnce()
    expect(mocked.persistSidebarWidth).toHaveBeenCalledWith(550)
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

  it('stops active resizing when the same instance changes to page mode', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const initialProps: HookProps = { mode: 'floating' }
    const { result, rerender } = renderHook(
      ({ mode }: HookProps) => useChatSidebarResize({ mode }),
      { initialProps },
    )

    act(() => {
      result.current.handleResizeStart(createResizeStartEvent())
    })
    rerender({ mode: 'page' })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'))
    })

    expect(result.current.isResizing).toBe(false)
    expect(mocked.persistSidebarWidth).not.toHaveBeenCalled()
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
})

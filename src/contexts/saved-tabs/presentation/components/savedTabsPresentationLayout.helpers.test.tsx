// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getLeftPaneWidthStoreSnapshot,
  useSavedTabsLeftPaneWidth,
} from './savedTabsPresentationLayout.helpers'

const resizeObserverState = vi.hoisted(() => {
  const instances: {
    callback: ResizeObserverCallback
    disconnect: ReturnType<typeof vi.fn>
    observe: ReturnType<typeof vi.fn>
  }[] = []

  class MockResizeObserver {
    callback: ResizeObserverCallback
    disconnect = vi.fn()
    observe = vi.fn()

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
      instances.push(this)
    }
  }

  return {
    MockResizeObserver,
    instances,
    emit(width: number) {
      const instance = instances.at(-1)
      if (!instance) {
        throw new Error('ResizeObserver instance not found')
      }
      instance.callback(
        [
          {
            contentRect: { width } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        instance as unknown as ResizeObserver,
      )
    },
    reset() {
      instances.length = 0
    },
  }
})

describe('useSavedTabsLeftPaneWidth', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    resizeObserverState.reset()
  })

  it('attachLeftPaneRef 経由で div を渡すと leftPaneWidth に viewport 幅が反映される', () => {
    const Probe = () => {
      const { attachLeftPaneRef, leftPaneRef, leftPaneWidth } =
        useSavedTabsLeftPaneWidth()
      return (
        <div>
          <div
            ref={attachLeftPaneRef}
            data-testid='left-pane'
            data-width={leftPaneWidth}
          />
          <div data-testid='ref-current'>
            {leftPaneRef.current ? 'attached' : 'unattached'}
          </div>
        </div>
      )
    }

    vi.stubGlobal(
      'ResizeObserver',
      resizeObserverState.MockResizeObserver as unknown as typeof ResizeObserver,
    )

    render(<Probe />)
    const leftPane = screen.getByTestId('left-pane')
    const widthAttr = leftPane.getAttribute('data-width')
    expect(widthAttr).not.toBeNull()
    expect(Number(widthAttr)).toBe(window.innerWidth)
    expect(screen.getByTestId('ref-current').textContent).toBe('attached')
  })

  it('ResizeObserver が undefined の場合は window resize イベントで leftPaneWidth を更新する', () => {
    vi.stubGlobal('ResizeObserver', undefined)

    const Probe = () => {
      const { attachLeftPaneRef, leftPaneWidth } = useSavedTabsLeftPaneWidth()
      return (
        <div
          ref={attachLeftPaneRef}
          data-testid='left-pane'
          data-width={leftPaneWidth}
        />
      )
    }

    const { rerender } = render(<Probe />)
    const leftPane = screen.getByTestId('left-pane')
    Object.defineProperty(leftPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 900 }) as DOMRect,
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    rerender(<Probe />)
    expect(
      Number(screen.getByTestId('left-pane').getAttribute('data-width')),
    ).toBe(900)
  })

  it('ResizeObserver が発火したら callback 経由で leftPaneWidth が更新される', () => {
    vi.stubGlobal(
      'ResizeObserver',
      resizeObserverState.MockResizeObserver as unknown as typeof ResizeObserver,
    )

    const Probe = () => {
      const { attachLeftPaneRef, leftPaneWidth } = useSavedTabsLeftPaneWidth()
      return (
        <div
          ref={attachLeftPaneRef}
          data-testid='left-pane'
          data-width={leftPaneWidth}
        />
      )
    }

    const { rerender } = render(<Probe />)
    act(() => {
      resizeObserverState.emit(900)
    })
    rerender(<Probe />)
    expect(
      Number(screen.getByTestId('left-pane').getAttribute('data-width')),
    ).toBe(900)
  })

  it('unmount 時に ResizeObserver.disconnect が呼ばれる', () => {
    vi.stubGlobal(
      'ResizeObserver',
      resizeObserverState.MockResizeObserver as unknown as typeof ResizeObserver,
    )

    const Probe = () => {
      const { attachLeftPaneRef } = useSavedTabsLeftPaneWidth()
      return <div ref={attachLeftPaneRef} data-testid='left-pane' />
    }

    const { unmount } = render(<Probe />)
    const last = resizeObserverState.instances.at(-1)
    expect(last).toBeDefined()
    unmount()
    expect(last?.disconnect).toHaveBeenCalled()
  })

  it('getLeftPaneWidthStoreSnapshot は width があればそれを返し、null なら window.innerWidth を返す', () => {
    expect(getLeftPaneWidthStoreSnapshot(640)).toBe(640)
    expect(getLeftPaneWidthStoreSnapshot(null)).toBe(window.innerWidth)
  })
})

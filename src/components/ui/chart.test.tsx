// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  responsiveContainerProps: undefined as Record<string, unknown> | undefined,
}))

const resizeObserverState = vi.hoisted(() => {
  const instances: Array<{
    callback: ResizeObserverCallback
    disconnect: ReturnType<typeof vi.fn>
    observe: ReturnType<typeof vi.fn>
  }> = []

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
    emit({ height, width }: { height: number; width: number }) {
      const instance = instances.at(-1)

      if (!instance) {
        throw new Error('ResizeObserver instance not found')
      }

      instance.callback(
        [
          {
            contentRect: { height, width } as DOMRectReadOnly,
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

vi.mock('recharts', () => ({
  Legend: () => null,
  ResponsiveContainer: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    mocked.responsiveContainerProps = props

    return <div data-testid='responsive-container'>{children}</div>
  },
  Tooltip: () => null,
}))

import { ChartContainer } from './chart'

describe('ChartContainer', () => {
  beforeEach(() => {
    resizeObserverState.reset()
    vi.stubGlobal(
      'ResizeObserver',
      resizeObserverState.MockResizeObserver as unknown as typeof ResizeObserver,
    )
  })

  afterEach(() => {
    mocked.responsiveContainerProps = undefined
    vi.unstubAllGlobals()
  })

  it('正のサイズが取れてから ResponsiveContainer を描画する', async () => {
    render(
      <ChartContainer
        className='h-64'
        config={{ active: { color: 'var(--color-primary)', label: 'Active' } }}
      >
        <div>chart</div>
      </ChartContainer>,
    )

    expect(screen.queryByTestId('responsive-container')).toBeNull()

    act(() => {
      resizeObserverState.emit({ height: 256, width: 320 })
    })

    expect(await screen.findByTestId('responsive-container')).toBeTruthy()
    expect(mocked.responsiveContainerProps).toMatchObject({
      height: '100%',
      minWidth: 0,
      width: '100%',
    })
  })
})

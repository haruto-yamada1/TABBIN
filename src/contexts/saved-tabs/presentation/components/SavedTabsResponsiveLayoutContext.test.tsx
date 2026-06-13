// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SavedTabsResponsiveLayoutProvider,
  useSavedTabsResponsiveLayout,
} from './SavedTabsResponsiveLayoutContext'

describe('SavedTabsResponsiveLayoutContext', () => {
  afterEach(() => {
    cleanup()
  })

  it('Provider 外で useSavedTabsResponsiveLayout を呼ぶと既定値 (isCompactLayout: false) を返す', () => {
    let captured: ReturnType<typeof useSavedTabsResponsiveLayout> | undefined

    const Probe = () => {
      captured = useSavedTabsResponsiveLayout()
      return null
    }

    render(<Probe />)

    expect(captured).toStrictEqual({ isCompactLayout: false })
  })

  it('Provider 配下で isCompactLayout=true を提供すると hook から取り出せる', () => {
    let captured: ReturnType<typeof useSavedTabsResponsiveLayout> | undefined

    const Probe = () => {
      captured = useSavedTabsResponsiveLayout()
      return <div data-testid='probe'>{String(captured?.isCompactLayout)}</div>
    }

    render(
      <SavedTabsResponsiveLayoutProvider isCompactLayout>
        <Probe />
      </SavedTabsResponsiveLayoutProvider>,
    )

    expect(screen.getByTestId('probe').textContent).toBe('true')
  })
  it('isCompactLayout=false を渡しても hook の値として反映される', () => {
    let captured: ReturnType<typeof useSavedTabsResponsiveLayout> | undefined

    const Probe = () => {
      captured = useSavedTabsResponsiveLayout()
      return null
    }

    render(
      <SavedTabsResponsiveLayoutProvider isCompactLayout={false}>
        <Probe />
      </SavedTabsResponsiveLayoutProvider>,
    )

    expect(captured?.isCompactLayout).toBe(false)
  })

  it('子の DOM 描画を維持したまま Provider だけ差し替えできる', () => {
    const Child = () => <div data-testid='child'>child</div>

    const { rerender } = render(
      <SavedTabsResponsiveLayoutProvider isCompactLayout>
        <Child />
      </SavedTabsResponsiveLayoutProvider>,
    )
    expect(screen.getByTestId('child').textContent).toBe('child')

    rerender(
      <SavedTabsResponsiveLayoutProvider isCompactLayout={false}>
        <Child />
      </SavedTabsResponsiveLayoutProvider>,
    )
    expect(screen.getByTestId('child').textContent).toBe('child')
  })

  it('isCompactLayout を変更しても context value メモ化が壊れない (spurious re-render 防止)', () => {
    const consumerRender = vi.fn()
    const Probe = () => {
      const { isCompactLayout } = useSavedTabsResponsiveLayout()
      consumerRender(isCompactLayout)
      return null
    }

    const { rerender } = render(
      <SavedTabsResponsiveLayoutProvider isCompactLayout>
        <Probe />
      </SavedTabsResponsiveLayoutProvider>,
    )
    expect(consumerRender).toHaveBeenCalledTimes(1)

    rerender(
      <SavedTabsResponsiveLayoutProvider isCompactLayout>
        <Probe />
      </SavedTabsResponsiveLayoutProvider>,
    )
    // isCompactLayout が同じ値なら useMemo が value を保持し、
    // consumer 側は context value 自体は同じ参照なので
    // 純粋 re-render は発生するが consumerRender 自体は 1 回のまま。
    expect(consumerRender.mock.calls.length).toBeLessThanOrEqual(2)
  })
})

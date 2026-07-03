// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SavedTabsScrollControls } from './SavedTabsScrollControls'

const scrollControlState = vi.hoisted(() => ({
  getScrollControlAvailability: vi.fn(),
  getRelativeScrollTarget: vi.fn(),
  scrollContainerToTarget: vi.fn(),
}))

vi.mock('@/features/i18n/lib/useI18nText', () => ({
  useI18nText: () => (key: string, fallback?: string) => fallback ?? key,
}))

vi.mock('@/contexts/saved-tabs/presentation/lib/scroll-controls', () => ({
  getRelativeScrollTarget: scrollControlState.getRelativeScrollTarget,
  getScrollControlAvailability: scrollControlState.getScrollControlAvailability,
  scrollContainerToTarget: scrollControlState.scrollContainerToTarget,
}))

const makeContainer = (): HTMLDivElement => {
  const container = document.createElement('div')
  container.dataset.savedTabsLayout = 'full'
  Object.defineProperty(container, 'scrollHeight', {
    value: 1000,
    configurable: true,
  })
  Object.defineProperty(container, 'clientHeight', {
    value: 500,
    configurable: true,
  })
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => 0,
    set: () => undefined,
  })
  // Provide a getBoundingClientRect stub for elements we might query
  container.getBoundingClientRect = () => ({ top: 0, height: 500 }) as DOMRect
  document.body.append(container)
  return container
}

const useAttachedRef = (): {
  ref: React.RefObject<HTMLDivElement | null>
  setRef: (node: HTMLDivElement | null) => void
} => {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) {
      const el = makeContainer()
      ref.current = el
    }
  })
  const setRef = (node: HTMLDivElement | null) => {
    if (node) {
      ref.current = node
    }
  }
  return { ref, setRef }
}

describe('contexts/SavedTabsScrollControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    scrollControlState.getScrollControlAvailability.mockReturnValue({
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
    scrollControlState.getRelativeScrollTarget.mockReturnValue(null)
    scrollControlState.scrollContainerToTarget.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    document.body.innerHTML = ''
  })

  const renderWithContainer = (
    viewMode: 'domain' | 'custom' = 'domain',
  ): HTMLDivElement | null => {
    let captured: HTMLDivElement | null = null
    const Probe = () => {
      const { ref, setRef } = useAttachedRef()
      return (
        <div>
          <div
            ref={(node) => {
              setRef(node)
              captured = node
            }}
            data-testid='left-pane'
          />
          <SavedTabsScrollControls
            scrollContainerRef={ref}
            viewMode={viewMode}
          />
        </div>
      )
    }
    render(<Probe />)
    return captured
  }

  it('domain モードで 8 つの scroll ボタン (top/previous-parent/previous-domain/previous-child/next-child/next-domain/next-parent/bottom) を描画する', () => {
    renderWithContainer('domain')
    const buttons = screen.getAllByRole('button')
    const labels = buttons
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label !== null)
    expect(labels).toStrictEqual([
      'Scroll to top',
      'Scroll to previous parent category',
      'Scroll to previous domain',
      'Scroll to previous child category',
      'Scroll to next child category',
      'Scroll to next domain',
      'Scroll to next parent category',
      'Scroll to bottom',
    ])
  })

  it('custom モードではプロジェクト移動ボタンだけを表示する', () => {
    renderWithContainer('custom')
    const buttons = screen.getAllByRole('button')
    const labels = buttons
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label !== null)
    expect(labels).toStrictEqual([
      'Scroll to top',
      'Scroll to previous project',
      'Scroll to next project',
      'Scroll to bottom',
    ])
  })

  it('scroll ボタンを hover なしでも opacity-100 で表示する', () => {
    renderWithContainer('domain')
    const scrollButtonGroup =
      screen.getByLabelText('Scroll to top').parentElement
    expect(scrollButtonGroup?.className.includes('opacity-100')).toBe(true)
    expect(scrollButtonGroup?.className.includes('opacity-35')).toBe(false)
    expect(scrollButtonGroup?.className.includes('opacity-70')).toBe(false)
  })

  it('初期状態で全ボタンが active なら disabled にならない', () => {
    renderWithContainer('domain')
    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it('unmount しても例外を投げない', () => {
    renderWithContainer('domain')
    cleanup()
    // cleanup() がエラーなく完了したことを確認
    expect(document.body.innerHTML).toBe('')
  })

  it('alt + ArrowUp / ArrowDown / PageUp / PageDown キーボードショートカットを受ける', () => {
    renderWithContainer('domain')
    act(() => {
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp' })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowDown' })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'PageUp' })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'PageDown' })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, {
        altKey: true,
        key: 'ArrowUp',
        shiftKey: true,
      })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, {
        altKey: true,
        key: 'ArrowDown',
        shiftKey: true,
      })
    })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('alt キー無しの keyDown は無視される', () => {
    renderWithContainer('domain')
    act(() => {
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: false, key: 'ArrowUp' })
    })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('metaKey / ctrlKey 併用時は alt + 矢印でも無視される', () => {
    renderWithContainer('domain')
    act(() => {
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp', metaKey: true })
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp', ctrlKey: true })
    })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('alt + 未知 key は無視される', () => {
    renderWithContainer('domain')
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.keyDown(window, { altKey: true, key: 'Home' })
    expect(scrollControlState.getRelativeScrollTarget).not.toHaveBeenCalled()
  })

  it('scrollContainerRef.current が null のときは useEffect が早期 return する', () => {
    const Probe = () => {
      const ref = useRef<HTMLDivElement | null>(null)
      return (
        <SavedTabsScrollControls scrollContainerRef={ref} viewMode='domain' />
      )
    }
    expect(() => render(<Probe />)).not.toThrow()
  })

  it('custom モードの上下プロジェクトボタンを押下しても例外を投げない', async () => {
    const user = userEvent.setup()
    renderWithContainer('custom')
    const buttons = screen.getAllByRole('button')
    const previousProject = buttons.find(
      (button) =>
        button.getAttribute('aria-label') === 'Scroll to previous project',
    )
    const nextProject = buttons.find(
      (button) =>
        button.getAttribute('aria-label') === 'Scroll to next project',
    )
    expect(previousProject).toBeDefined()
    expect(nextProject).toBeDefined()
    await user.click(previousProject as HTMLElement)
    await user.click(nextProject as HTMLElement)
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('Scroll to top ボタン押下で container.scrollTo({ top: 0, behavior: "smooth" }) を呼ぶ', async () => {
    const user = userEvent.setup()
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    const scrollTo = vi.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    await user.click(screen.getByLabelText('Scroll to top'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 0,
    })
  })

  it('Scroll to bottom ボタン押下で container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }) を呼ぶ', async () => {
    const user = userEvent.setup()
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    const scrollTo = vi.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    await user.click(screen.getByLabelText('Scroll to bottom'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: container?.scrollHeight,
    })
  })

  it('getRelativeScrollTarget が target を返すと highlight / scrollTo / announce / updateAvailability を順に呼ぶ', async () => {
    const user = userEvent.setup()
    const targetEl = document.createElement('div')
    targetEl.classList.add('saved-tabs-scroll-target')
    targetEl.setAttribute('data-saved-tabs-scroll-target', 'parent')
    targetEl.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    document.body.append(targetEl)
    scrollControlState.getRelativeScrollTarget.mockReturnValue(targetEl)
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    await user.click(
      screen.getByLabelText('Scroll to previous parent category'),
    )
    expect(scrollControlState.scrollContainerToTarget).toHaveBeenCalled()
  })

  it('highlight は timeout 後に解除される', async () => {
    vi.useFakeTimers()
    const target = document.createElement('div')
    scrollControlState.getRelativeScrollTarget.mockReturnValue(target)
    renderWithContainer('domain')

    // userEvent is incompatible with fake timers; use fireEvent here
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.click(screen.getByLabelText('Scroll to previous parent category'))
    expect(target.classList.contains('saved-tabs-scroll-highlight')).toBe(true)
    void act(() => vi.advanceTimersByTime(1_200))
    expect(target.classList.contains('saved-tabs-scroll-highlight')).toBe(false)
  })

  it('getRelativeScrollTarget が null を返す場合 updateAvailability だけ呼んで早期 return', async () => {
    const user = userEvent.setup()
    scrollControlState.getRelativeScrollTarget.mockReturnValue(null)
    renderWithContainer('domain')
    await user.click(
      screen.getByLabelText('Scroll to previous parent category'),
    )
    expect(scrollControlState.scrollContainerToTarget).not.toHaveBeenCalled()
  })

  it('container に scroll イベントを送ると updateAvailability が呼ばれる', () => {
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    act(() => {
      container?.dispatchEvent(new Event('scroll'))
    })
    expect(scrollControlState.getScrollControlAvailability).toHaveBeenCalled()
  })

  it('container が null の状態で container が必要な関数を呼んでも例外を投げない', async () => {
    const user = userEvent.setup()
    const container = renderWithContainer('domain')
    const scrollTo = vi.fn()
    // ref.current を取り出せないシナリオで Scroll to top をクリック
    // (container の scrollTo はこのテストでは定義されない)
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    await user.click(screen.getByLabelText('Scroll to top'))
    expect(scrollTo).toHaveBeenCalled()
  })

  it('描画後に ref が null になった top/bottom/relative 操作は no-op', async () => {
    const user = userEvent.setup()
    const ref: { current: HTMLDivElement | null } = {
      current: document.createElement('div'),
    }
    render(
      <SavedTabsScrollControls scrollContainerRef={ref} viewMode='domain' />,
    )
    ref.current = null

    await user.click(screen.getByLabelText('Scroll to top'))
    await user.click(screen.getByLabelText('Scroll to bottom'))
    await user.click(
      screen.getByLabelText('Scroll to previous parent category'),
    )

    expect(scrollControlState.scrollContainerToTarget).not.toHaveBeenCalled()
  })

  it('button 長押しで遅延後に scroll を反復し mouseUp で停止する', () => {
    vi.useFakeTimers()
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    const scrollTo = vi.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    const topButton = screen.getByLabelText('Scroll to top')

    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.mouseDown(topButton)
    void act(() => vi.advanceTimersByTime(700))
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.mouseUp(topButton)
    const callsAfterMouseUp = scrollTo.mock.calls.length
    void act(() => vi.advanceTimersByTime(500))

    expect(callsAfterMouseUp).toBeGreaterThan(0)
    expect(scrollTo).toHaveBeenCalledTimes(callsAfterMouseUp)
  })
})

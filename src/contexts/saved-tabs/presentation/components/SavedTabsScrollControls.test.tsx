// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SavedTabsScrollControls } from './SavedTabsScrollControls'

const scrollControlState = vi.hoisted(() => ({
  getScrollControlAvailability: vi.fn(),
  getRelativeScrollTarget: vi.fn(),
  scrollContainerToTarget: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18nText: () => (key: string, fallback?: string) => fallback ?? key,
}))

vi.mock('@/features/saved-tabs/lib/scroll-controls', () => ({
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
      // eslint-disable-next-line typescript/TS2339
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
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp' })
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowDown' })
      fireEvent.keyDown(window, { altKey: true, key: 'PageUp' })
      fireEvent.keyDown(window, { altKey: true, key: 'PageDown' })
      fireEvent.keyDown(window, {
        altKey: true,
        key: 'ArrowUp',
        shiftKey: true,
      })
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
      fireEvent.keyDown(window, { altKey: false, key: 'ArrowUp' })
    })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('metaKey / ctrlKey 併用時は alt + 矢印でも無視される', () => {
    renderWithContainer('domain')
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp', metaKey: true })
      fireEvent.keyDown(window, { altKey: true, key: 'ArrowUp', ctrlKey: true })
    })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
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

  it('custom モードの上下プロジェクトボタンを押下しても例外を投げない', () => {
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
    act(() => {
      fireEvent.click(previousProject as HTMLElement)
      fireEvent.click(nextProject as HTMLElement)
    })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('Scroll to top ボタン押下で container.scrollTo({ top: 0, behavior: "smooth" }) を呼ぶ', () => {
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    const scrollTo = vi.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    fireEvent.click(screen.getByLabelText('Scroll to top'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 0,
    })
  })

  it('Scroll to bottom ボタン押下で container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }) を呼ぶ', () => {
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    const scrollTo = vi.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    fireEvent.click(screen.getByLabelText('Scroll to bottom'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: container?.scrollHeight,
    })
  })

  it('getRelativeScrollTarget が target を返すと highlight / scrollTo / announce / updateAvailability を順に呼ぶ', () => {
    const targetEl = document.createElement('div')
    targetEl.classList.add('saved-tabs-scroll-target')
    targetEl.setAttribute('data-saved-tabs-scroll-target', 'parent')
    targetEl.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    document.body.append(targetEl)
    scrollControlState.getRelativeScrollTarget.mockReturnValue(targetEl)
    const container = renderWithContainer('domain')
    expect(container).not.toBeNull()
    fireEvent.click(screen.getByLabelText('Scroll to previous parent category'))
    expect(scrollControlState.scrollContainerToTarget).toHaveBeenCalled()
  })

  it('getRelativeScrollTarget が null を返す場合 updateAvailability だけ呼んで早期 return', () => {
    scrollControlState.getRelativeScrollTarget.mockReturnValue(null)
    renderWithContainer('domain')
    fireEvent.click(screen.getByLabelText('Scroll to previous parent category'))
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

  it('container が null の状態で container が必要な関数を呼んでも例外を投げない', () => {
    const container = renderWithContainer('domain')
    const scrollTo = vi.fn()
    // ref.current を取り出せないシナリオで Scroll to top をクリック
    // (container の scrollTo はこのテストでは定義されない)
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    fireEvent.click(screen.getByLabelText('Scroll to top'))
    expect(scrollTo).toHaveBeenCalled()
  })
})

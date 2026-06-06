// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    emitEmpty() {
      const instance = instances.at(-1)
      if (!instance) {
        throw new Error('ResizeObserver instance not found')
      }

      instance.callback([], instance as unknown as ResizeObserver)
    },
    reset() {
      instances.length = 0
    },
  }
})

const profilerMock = vi.hoisted(() => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

vi.mock('@/features/saved-tabs/app/SavedTabsApp', () => ({
  SavedTabsApp: ({
    initialViewMode,
    isAiSidebarOpen,
  }: {
    initialViewMode?: string
    isAiSidebarOpen?: boolean
  }) => {
    const viewMode = initialViewMode ?? 'none'
    const scrollTargets =
      viewMode === 'custom'
        ? [
            createElement('div', {
              'data-saved-tabs-scroll-target': 'project',
              'data-testid': 'project-previous',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'project',
              'data-testid': 'project-next',
            }),
          ]
        : [
            createElement('div', {
              'data-saved-tabs-scroll-target': 'parent',
              'data-testid': 'parent-previous',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'parent',
              'data-testid': 'parent-next',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'domain',
              'data-testid': 'domain-previous',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'domain',
              'data-testid': 'domain-next',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'child',
              'data-testid': 'child-previous',
            }),
            createElement('div', {
              'data-saved-tabs-scroll-target': 'child',
              'data-testid': 'child-next',
            }),
          ]

    return createElement(
      'div',
      null,
      createElement(
        'div',
        null,
        `SavedTabsApp:${String(Boolean(isAiSidebarOpen))}:${viewMode}`,
      ),
      ...scrollTargets,
    )
  },
}))

vi.mock('@/features/saved-tabs/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: profilerMock.handleSavedTabsRender,
  get isDevProfileEnabled() {
    return profilerMock.isDevProfileEnabled
  },
}))

const historyMock = vi.hoisted(() => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  selectConversation: vi.fn(),
  updateMessages: vi.fn(),
  useSharedAiChatHistory: vi.fn(),
}))

vi.mock('@/features/ai-chat/hooks/useSharedAiChatHistory', () => ({
  useSharedAiChatHistory: historyMock.useSharedAiChatHistory,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: ({
    historyVariant,
    onOpenChange,
  }: {
    historyVariant?: string
    onOpenChange?: (isOpen: boolean) => void
  }) => {
    const history = historyMock.useSharedAiChatHistory()

    return createElement(
      'div',
      null,
      createElement('div', null, `history-variant:${historyVariant ?? 'none'}`),
      createElement(
        'div',
        null,
        `active-title:${history.activeConversation?.title ?? ''}`,
      ),
      createElement(
        'button',
        {
          onClick: () => onOpenChange?.(true),
          type: 'button',
        },
        'open-sidebar',
      ),
      createElement(
        'button',
        {
          onClick: () => onOpenChange?.(false),
          type: 'button',
        },
        'close-sidebar',
      ),
      createElement(
        'button',
        {
          onClick: () => history.deleteConversation('conversation-2'),
          type: 'button',
        },
        'delete-history',
      ),
      createElement(
        'button',
        {
          onClick: () => history.selectConversation('conversation-2'),
          type: 'button',
        },
        'select-history',
      ),
    )
  },
}))

import { SavedTabsRoute, getLeftPaneWidthStoreSnapshot } from './SavedTabsRoute'

describe('SavedTabsRoute', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resizeObserverState.reset()
    window.history.replaceState({}, '', '/saved-tabs.html')
    const chromeGlobal = globalThis as unknown as {
      chrome: typeof chrome & {
        i18n?: {
          getUILanguage: () => string
        }
      }
    }
    chromeGlobal.chrome = {
      ...chromeGlobal.chrome,
      i18n: {
        getUILanguage: () => 'ja',
      },
    } as typeof chrome
    historyMock.useSharedAiChatHistory.mockReturnValue({
      activeConversation: {
        createdAt: 1,
        id: 'conversation-1',
        messages: [
          {
            content: '最初の会話',
            id: 'message-1',
            role: 'user',
          },
        ],
        title: '最初の会話',
        updatedAt: 1,
      },
      createConversation: historyMock.createConversation,
      deleteConversation: historyMock.deleteConversation,
      historyItems: [
        {
          id: 'conversation-1',
          isActive: true,
          preview: '最初の会話',
          title: '最初の会話',
        },
        {
          id: 'conversation-2',
          isActive: false,
          preview: '別の会話',
          title: '別の会話',
        },
      ],
      isLoading: false,
      selectConversation: historyMock.selectConversation,
      updateMessages: historyMock.updateMessages,
    })
    profilerMock.isDevProfileEnabled = false
    vi.stubGlobal(
      'ResizeObserver',
      resizeObserverState.MockResizeObserver as unknown as typeof ResizeObserver,
    )
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('SavedTabsApp と AI チャットウィジェットを split layout で描画する', () => {
    render(createElement(SavedTabsRoute))

    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByText('SavedTabsApp:false:domain')).toBeTruthy()
    expect(screen.getByText('open-sidebar')).toBeTruthy()
    expect(screen.getByText('history-variant:dropdown')).toBeTruthy()
    expect(screen.getByText('active-title:最初の会話')).toBeTruthy()
    expect(getLeftPaneWidthStoreSnapshot(640)).toBe(640)
    expect(getLeftPaneWidthStoreSnapshot(null)).toBe(window.innerWidth)
  })

  it('dev profile が有効なら SavedTabsApp を Profiler 内で描画する', () => {
    profilerMock.isDevProfileEnabled = true

    render(createElement(SavedTabsRoute))

    expect(screen.getByText('SavedTabsApp:false:domain')).toBeTruthy()
  })

  it('URL の mode クエリを SavedTabsApp の初期モードへ渡す', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')

    render(createElement(SavedTabsRoute))

    expect(screen.getByText('SavedTabsApp:false:custom')).toBeTruthy()
  })

  it('viewport 固定の split layout にして root document はスクロールさせない', () => {
    render(createElement(SavedTabsRoute))

    const layout = screen.getByTestId('saved-tabs-page-layout')
    const leftPane = screen.getByTestId('saved-tabs-left-pane')

    expect(layout.className.includes('h-screen')).toBe(true)
    expect(layout.className.includes('overflow-hidden')).toBe(true)
    expect(leftPane.className.includes('overflow-y-auto')).toBe(true)
    expect(leftPane.className.includes('overscroll-contain')).toBe(true)
  })

  it('左ペイン内のボタンで最上部と最下部へスクロールする', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const scrollTo = vi.fn()
    Object.defineProperty(leftPane, 'scrollTop', {
      configurable: true,
      value: 100,
      writable: true,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(leftPane, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 2400,
    })
    fireEvent.scroll(leftPane)

    fireEvent.click(screen.getByLabelText('最上部へ移動'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 0,
    })

    fireEvent.click(screen.getByLabelText('最下部へ移動'))
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 2400,
    })
  })

  it('左ペイン内のボタンで前後の親カテゴリ、ドメイン、子カテゴリへスクロールする', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const parentPrevious = screen.getByTestId('parent-previous')
    const parentNext = screen.getByTestId('parent-next')
    const domainPrevious = screen.getByTestId('domain-previous')
    const domainNext = screen.getByTestId('domain-next')
    const childPrevious = screen.getByTestId('child-previous')
    const childNext = screen.getByTestId('child-next')
    const scrollTo = vi.fn()

    Object.defineProperty(leftPane, 'scrollTop', {
      configurable: true,
      value: 500,
      writable: true,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(leftPane, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    vi.spyOn(leftPane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect)
    vi.spyOn(parentPrevious, 'getBoundingClientRect').mockReturnValue({
      top: 20,
    } as DOMRect)
    vi.spyOn(parentNext, 'getBoundingClientRect').mockReturnValue({
      top: 220,
    } as DOMRect)
    vi.spyOn(domainPrevious, 'getBoundingClientRect').mockReturnValue({
      top: 30,
    } as DOMRect)
    vi.spyOn(domainNext, 'getBoundingClientRect').mockReturnValue({
      top: 240,
    } as DOMRect)
    vi.spyOn(childPrevious, 'getBoundingClientRect').mockReturnValue({
      top: 40,
    } as DOMRect)
    vi.spyOn(childNext, 'getBoundingClientRect').mockReturnValue({
      top: 260,
    } as DOMRect)
    fireEvent.scroll(leftPane)

    fireEvent.click(screen.getByLabelText('上の親カテゴリへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 324,
    })

    fireEvent.click(screen.getByLabelText('上の子カテゴリへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 344,
    })

    fireEvent.click(screen.getByLabelText('上のドメインへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 334,
    })

    fireEvent.click(screen.getByLabelText('下の親カテゴリへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 524,
    })

    fireEvent.click(screen.getByLabelText('下の子カテゴリへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 564,
    })

    fireEvent.click(screen.getByLabelText('下のドメインへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 544,
    })
  })

  it('押せない方向を無効化する', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const parentPrevious = screen.getByTestId('parent-previous')
    const parentNext = screen.getByTestId('parent-next')
    vi.spyOn(leftPane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect)
    vi.spyOn(parentPrevious, 'getBoundingClientRect').mockReturnValue({
      top: 196,
    } as DOMRect)
    vi.spyOn(parentNext, 'getBoundingClientRect').mockReturnValue({
      top: 220,
    } as DOMRect)
    Object.defineProperty(leftPane, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 1200,
    })
    fireEvent.scroll(leftPane)

    expect(screen.getByLabelText('最上部へ移動').disabled).toBe(true)
    expect(screen.getByLabelText('上の親カテゴリへ移動').disabled).toBe(true)
    expect(screen.getByLabelText('下の親カテゴリへ移動').disabled).toBe(false)
    expect(screen.getByLabelText('最下部へ移動').disabled).toBe(false)
  })

  it('カテゴリ移動後に対象をハイライトして通知する', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const parentNext = screen.getByTestId('parent-next')
    Object.defineProperty(leftPane, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(leftPane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect)
    vi.spyOn(parentNext, 'getBoundingClientRect').mockReturnValue({
      top: 220,
    } as DOMRect)
    fireEvent.scroll(leftPane)

    fireEvent.click(screen.getByLabelText('下の親カテゴリへ移動'))

    expect(parentNext.classList.contains('saved-tabs-scroll-highlight')).toBe(
      true,
    )
    expect(screen.getByRole('status').textContent).toBe('下の親カテゴリへ移動')

    act(() => {
      vi.runAllTimers()
    })
    expect(parentNext.classList.contains('saved-tabs-scroll-highlight')).toBe(
      false,
    )
  })

  it('キーボードショートカットで親カテゴリ、ドメイン、子カテゴリへ移動する', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const parentNext = screen.getByTestId('parent-next')
    const domainNext = screen.getByTestId('domain-next')
    const childNext = screen.getByTestId('child-next')
    const scrollTo = vi.fn()
    Object.defineProperty(leftPane, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    vi.spyOn(leftPane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect)
    vi.spyOn(parentNext, 'getBoundingClientRect').mockReturnValue({
      top: 220,
    } as DOMRect)
    vi.spyOn(domainNext, 'getBoundingClientRect').mockReturnValue({
      top: 240,
    } as DOMRect)
    vi.spyOn(childNext, 'getBoundingClientRect').mockReturnValue({
      top: 260,
    } as DOMRect)
    fireEvent.scroll(leftPane)

    fireEvent.keyDown(window, { altKey: true, key: 'ArrowDown' })
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 24,
    })

    fireEvent.keyDown(window, { altKey: true, key: 'PageDown' })
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 44,
    })

    fireEvent.keyDown(window, {
      altKey: true,
      key: 'ArrowDown',
      shiftKey: true,
    })
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 64,
    })
  })

  it('スクロール操作ボタンを指定順に表示する', () => {
    render(createElement(SavedTabsRoute))

    const labels = screen
      .getAllByRole('button')
      .reduce<string[]>((items, button) => {
        const label = button.getAttribute('aria-label')
        if (label) {
          items.push(label)
        }
        return items
      }, [])

    expect(labels).toStrictEqual([
      '最上部へ移動',
      '上の親カテゴリへ移動',
      '上のドメインへ移動',
      '上の子カテゴリへ移動',
      '下の子カテゴリへ移動',
      '下のドメインへ移動',
      '下の親カテゴリへ移動',
      '最下部へ移動',
    ])
  })

  it('カスタムモードではプロジェクト移動ボタンだけを表示する', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')

    render(createElement(SavedTabsRoute))

    const labels = screen
      .getAllByRole('button')
      .reduce<string[]>((items, button) => {
        const label = button.getAttribute('aria-label')
        if (label) {
          items.push(label)
        }
        return items
      }, [])

    expect(labels).toStrictEqual([
      '最上部へ移動',
      '上のプロジェクトへ移動',
      '下のプロジェクトへ移動',
      '最下部へ移動',
    ])
  })

  it('カスタムモードではプロジェクト単位でスクロールする', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    const projectPrevious = screen.getByTestId('project-previous')
    const projectNext = screen.getByTestId('project-next')
    const scrollTo = vi.fn()

    Object.defineProperty(leftPane, 'scrollTop', {
      configurable: true,
      value: 500,
      writable: true,
    })
    Object.defineProperty(leftPane, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(leftPane, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(leftPane, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    vi.spyOn(leftPane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect)
    vi.spyOn(projectPrevious, 'getBoundingClientRect').mockReturnValue({
      top: 30,
    } as DOMRect)
    vi.spyOn(projectNext, 'getBoundingClientRect').mockReturnValue({
      top: 240,
    } as DOMRect)
    fireEvent.scroll(leftPane)

    fireEvent.click(screen.getByLabelText('上のプロジェクトへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 334,
    })

    fireEvent.click(screen.getByLabelText('下のプロジェクトへ移動'))
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 544,
    })
  })

  it('スクロール操作ボタンを hover なしでも常に明瞭に表示する', () => {
    render(createElement(SavedTabsRoute))

    const scrollButtonGroup =
      screen.getByLabelText('最上部へ移動').parentElement

    expect(scrollButtonGroup?.className.includes('opacity-35')).toBe(false)
    expect(scrollButtonGroup?.className.includes('opacity-70')).toBe(false)
    expect(scrollButtonGroup?.className.includes('opacity-100')).toBe(true)
  })

  it('AI サイドバーの open 状態を SavedTabsApp へ渡す', () => {
    render(createElement(SavedTabsRoute))

    fireEvent.click(screen.getByText('open-sidebar'))
    expect(screen.getByText('SavedTabsApp:true:domain')).toBeTruthy()

    fireEvent.click(screen.getByText('close-sidebar'))
    expect(screen.getByText('SavedTabsApp:false:domain')).toBeTruthy()
  })

  it('履歴選択を共通履歴 hook に委譲する', () => {
    render(createElement(SavedTabsRoute))

    fireEvent.click(screen.getByText('select-history'))

    expect(historyMock.selectConversation).toHaveBeenCalledWith(
      'conversation-2',
    )
  })

  it('履歴削除を共通履歴 hook に委譲する', () => {
    render(createElement(SavedTabsRoute))

    fireEvent.click(screen.getByText('delete-history'))

    expect(historyMock.deleteConversation).toHaveBeenCalledWith(
      'conversation-2',
    )
  })

  it('左ペインの実幅に応じて responsive layout 状態を切り替える', () => {
    render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('full')

    act(() => {
      resizeObserverState.emit(window.innerWidth)
    })
    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('full')

    act(() => {
      resizeObserverState.emit(900)
    })
    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('compact')

    act(() => {
      resizeObserverState.emitEmpty()
    })
    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('compact')

    act(() => {
      resizeObserverState.emit(1200)
    })
    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('full')
  })

  it('ResizeObserver が無い環境では window resize を使って左ペイン幅を追従する', () => {
    vi.stubGlobal('ResizeObserver', undefined)

    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    using removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(createElement(SavedTabsRoute))

    const leftPane = screen.getByTestId('saved-tabs-left-pane')
    using getBoundingClientRectSpy = vi.spyOn(leftPane, 'getBoundingClientRect')
    getBoundingClientRectSpy.mockReturnValue({
      width: 900,
    } as DOMRect)

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(leftPane.getAttribute('data-saved-tabs-layout')).toBe('compact')
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    )

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    )
  })
})

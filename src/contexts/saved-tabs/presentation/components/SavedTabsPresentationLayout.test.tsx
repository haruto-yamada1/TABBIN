// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

const presentationMock = vi.hoisted(() => ({
  onAiSidebarOpenChange: undefined as ((isOpen: boolean) => void) | undefined,
  scrollControlsCalls: 0,
}))

vi.mock('@/contexts/saved-tabs/presentation/app/SavedTabsApp', () => ({
  SavedTabsApp: ({
    initialViewMode,
    isAiSidebarOpen,
    onViewModeNavigate,
  }: {
    initialViewMode?: string
    isAiSidebarOpen?: boolean
    onViewModeNavigate?: (mode: string) => void
  }) => (
    <div>
      <div data-testid='saved-tabs-app-mock'>
        {`SavedTabsApp:${String(Boolean(isAiSidebarOpen))}:${initialViewMode ?? 'none'}`}
      </div>
      <button type='button' onClick={() => onViewModeNavigate?.('custom')}>
        navigate-custom
      </button>
    </div>
  ),
}))

vi.mock('@/contexts/saved-tabs/presentation/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

vi.mock('./SavedTabsScrollControls', () => ({
  SavedTabsScrollControls: () => {
    presentationMock.scrollControlsCalls += 1
    return <div data-testid='saved-tabs-scroll-controls-mock' />
  },
}))

vi.mock('./SavedTabsChatWidgetBridge', () => ({
  SavedTabsChatWidgetBridge: ({
    onOpenChange,
  }: {
    onOpenChange: (isOpen: boolean) => void
  }) => {
    presentationMock.onAiSidebarOpenChange = onOpenChange
    return (
      <div data-testid='saved-tabs-chat-widget-bridge-mock'>
        chat-widget-bridge
      </div>
    )
  },
}))

import { useRef } from 'react'

import { SavedTabsPresentationLayout } from './SavedTabsPresentationLayout'

describe('SavedTabsPresentationLayout', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    presentationMock.onAiSidebarOpenChange = undefined
    presentationMock.scrollControlsCalls = 0
  })

  const renderLayout = ({
    isCompactLeftPaneLayout = false,
    isAiSidebarOpen = false,
    initialViewMode = 'domain' as 'domain' | 'custom',
  } = {}) => {
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <SavedTabsPresentationLayout
          attachLeftPaneRef={(node) => {
            leftPaneRef.current = node
          }}
          initialViewMode={initialViewMode}
          isAiSidebarOpen={isAiSidebarOpen}
          isCompactLeftPaneLayout={isCompactLeftPaneLayout}
          leftPaneRef={leftPaneRef}
          onAiSidebarOpenChange={vi.fn()}
        />
      )
    }
    return render(<Probe />)
  }

  it('outer split layout (saved-tabs-page-layout) と left pane (saved-tabs-left-pane) を描画する', () => {
    renderLayout()
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-left-pane')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('SavedTabsApp に initialViewMode / isAiSidebarOpen を渡す', () => {
    renderLayout({ initialViewMode: 'custom', isAiSidebarOpen: true })
    expect(screen.getByTestId('saved-tabs-app-mock').textContent).toBe(
      'SavedTabsApp:true:custom',
    )
  })

  it('compact layout のとき data-saved-tabs-layout="compact" を出力する', () => {
    renderLayout({ isCompactLeftPaneLayout: true })
    expect(
      screen
        .getByTestId('saved-tabs-left-pane')
        .getAttribute('data-saved-tabs-layout'),
    ).toBe('compact')
  })

  it('full layout のとき data-saved-tabs-layout="full" を出力する', () => {
    renderLayout({ isCompactLeftPaneLayout: false })
    expect(
      screen
        .getByTestId('saved-tabs-left-pane')
        .getAttribute('data-saved-tabs-layout'),
    ).toBe('full')
  })

  it('SavedTabsScrollControls と SavedTabsChatWidgetBridge を描画する', () => {
    renderLayout()
    expect(screen.getByTestId('saved-tabs-scroll-controls-mock')).toBeTruthy()
    expect(
      screen.getByTestId('saved-tabs-chat-widget-bridge-mock'),
    ).toBeTruthy()
    expect(presentationMock.scrollControlsCalls).toBe(1)
  })

  it('onAiSidebarOpenChange を SavedTabsChatWidgetBridge へ伝える', () => {
    const onAiSidebarOpenChange = vi.fn()
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <SavedTabsPresentationLayout
          attachLeftPaneRef={() => undefined}
          initialViewMode='domain'
          isAiSidebarOpen={false}
          isCompactLeftPaneLayout={false}
          leftPaneRef={leftPaneRef}
          onAiSidebarOpenChange={onAiSidebarOpenChange}
        />
      )
    }
    render(<Probe />)
    expect(presentationMock.onAiSidebarOpenChange).toBe(onAiSidebarOpenChange)
  })

  it('onViewModeNavigate を SavedTabsApp へ伝える', () => {
    const onViewModeNavigate = vi.fn()
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <SavedTabsPresentationLayout
          attachLeftPaneRef={() => undefined}
          initialViewMode='domain'
          isAiSidebarOpen={false}
          isCompactLeftPaneLayout={false}
          leftPaneRef={leftPaneRef}
          onAiSidebarOpenChange={vi.fn()}
          onViewModeNavigate={onViewModeNavigate}
        />
      )
    }
    render(<Probe />)
    screen.getByText('navigate-custom').click()
    expect(onViewModeNavigate).toHaveBeenCalledWith('custom')
  })
})

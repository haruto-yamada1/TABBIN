// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeModuleLoads = vi.hoisted(() => ({
  aiChat: 0,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/components/LanguageSelect', () => ({
  LanguageSelect: () => <div>表示言語</div>,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string) =>
      (
        ({
          'sidebar.analytics': '分析',
          'sidebar.chat': 'チャット',
          'sidebar.collapse': 'サイドバーを小さくする',
          'sidebar.open': 'サイドバーを開く',
          'sidebar.options': 'オプション',
          'sidebar.periodicExecution': '定期実行',
          'sidebar.tabList': 'タブ一覧',
          'savedTabs.viewMode.custom': 'カスタムモード',
          'savedTabs.viewMode.domain': 'ドメインモード',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock('@/features/saved-tabs/routes/SavedTabsRoute', () => ({
  SavedTabsRoute: ({
    onViewModeNavigate,
    search,
  }: {
    onViewModeNavigate?: (mode: 'custom' | 'domain') => void
    search?: string
  }) => (
    <div>
      <div>{`saved-tabs-route:${search ?? ''}`}</div>
      <button onClick={() => onViewModeNavigate?.('custom')} type='button'>
        navigate-custom
      </button>
      <button onClick={() => onViewModeNavigate?.('domain')} type='button'>
        navigate-domain
      </button>
    </div>
  ),
}))

vi.mock('@/features/ai-chat/routes/AiChatRoute', () => {
  routeModuleLoads.aiChat += 1
  return {
    AiChatRoute: () => <div>ai-chat-route</div>,
  }
})

vi.mock('@/features/analytics/routes/AnalyticsRoute', () => ({
  AnalyticsRoute: () => <div>analytics-route</div>,
}))

vi.mock('@/features/periodic-execution/routes/PeriodicExecutionRoute', () => ({
  PeriodicExecutionRoute: () => <div>periodic-execution-route</div>,
}))

vi.mock('@/features/options/routes/OptionsRoute', () => ({
  OptionsRoute: () => <div>options-route</div>,
}))

import { AppRouter } from './AppRouter'

describe('AppRouter', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    cleanup()
  })

  it('saved-tabs 初期表示では ai-chat route module を読み込まない', async () => {
    expect(routeModuleLoads.aiChat).toBe(0)

    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    expect(
      await screen.findByText('saved-tabs-route:?mode=domain'),
    ).toBeTruthy()
    expect(routeModuleLoads.aiChat).toBe(0)
  })

  it('ルートパスは domain mode の saved-tabs に redirect する', async () => {
    render(<AppRouter initialEntries={['/']} />)

    expect(
      await screen.findByText('saved-tabs-route:?mode=domain'),
    ).toBeTruthy()
  })

  it('サイドバークリックで SPA 遷移する', async () => {
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    const analyticsLink = screen.getAllByRole('link', {
      name: '分析',
    })[0]
    if (!analyticsLink) {
      throw new Error('分析リンクが見つかりません')
    }

    fireEvent.click(analyticsLink)

    expect(await screen.findByText('analytics-route')).toBeTruthy()
  })

  it('router context では内部リンクが app.html ではなく route を指す', () => {
    render(<AppRouter initialEntries={['/saved-tabs?mode=custom']} />)

    fireEvent.click(screen.getByRole('button', { name: 'サイドバーを開く' }))

    expect(
      screen
        .getAllByRole('link', { name: 'チャット' })[0]
        ?.getAttribute('href'),
    ).toBe('/ai-chat')
    expect(
      screen.getAllByRole('link', { name: '分析' })[0]?.getAttribute('href'),
    ).toBe('/analytics')
    expect(
      screen
        .getAllByRole('link', { name: 'カスタムモード' })[0]
        ?.getAttribute('href'),
    ).toBe('/saved-tabs?mode=custom')
  })

  it('analytics route を開ける', async () => {
    render(<AppRouter initialEntries={['/analytics']} />)

    expect(await screen.findByText('analytics-route')).toBeTruthy()
  })

  it('options route を開ける', async () => {
    render(<AppRouter initialEntries={['/options']} />)

    expect(await screen.findByText('options-route')).toBeTruthy()
  })

  it('ai-chat route を開ける', async () => {
    render(<AppRouter initialEntries={['/ai-chat']} />)

    expect(await screen.findByText('ai-chat-route')).toBeTruthy()
  })

  it('periodic-execution route を開ける', async () => {
    render(<AppRouter initialEntries={['/periodic-execution']} />)

    expect(await screen.findByText('periodic-execution-route')).toBeTruthy()
  })

  it('SavedTabsRoute から別 mode を選ぶと replace navigate する', async () => {
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    fireEvent.click(screen.getByRole('button', { name: 'navigate-custom' }))

    expect(
      await screen.findByText('saved-tabs-route:?mode=custom'),
    ).toBeTruthy()
  })

  it('SavedTabsRoute から同じ mode を選んだ場合は再 navigate しない', async () => {
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    fireEvent.click(screen.getByRole('button', { name: 'navigate-domain' }))

    expect(
      await screen.findByText('saved-tabs-route:?mode=domain'),
    ).toBeTruthy()
  })

  it('mode 指定が無い saved-tabs route は domain で開く', async () => {
    const remove = vi.fn(async () => undefined)
    globalThis.chrome = {
      storage: {
        local: {
          remove,
        },
      },
    } as unknown as typeof chrome

    render(<AppRouter initialEntries={['/saved-tabs']} />)

    expect(
      await screen.findByText('saved-tabs-route:?mode=domain'),
    ).toBeTruthy()
    expect(remove).toHaveBeenCalledWith('viewMode')
  })

  it('不明なルートは domain で開く', async () => {
    render(<AppRouter initialEntries={['/unknown']} />)

    expect(
      await screen.findByText('saved-tabs-route:?mode=domain'),
    ).toBeTruthy()
  })

  it('initialEntries が無い場合は HashRouter を使う', async () => {
    window.history.replaceState({}, '', '/app.html#/saved-tabs?mode=custom')

    render(<AppRouter />)

    expect(
      await screen.findByText('saved-tabs-route:?mode=custom'),
    ).toBeTruthy()
  })
})

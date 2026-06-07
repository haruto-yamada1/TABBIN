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
// eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
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
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      <button onClick={() => onViewModeNavigate?.('custom')} type='button'>
        navigate-custom
      </button>
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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

// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
    expect(routeModuleLoads.aiChat).toBe(0)
  })

  it('ルートパスは domain mode の saved-tabs に redirect する', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
  })

  it('サイドバークリックで SPA 遷移する', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    const analyticsLink = screen.getAllByRole('link', {
      name: '分析',
    })[0]
    if (!analyticsLink) {
      throw new Error('分析リンクが見つかりません')
    }

    fireEvent.click(analyticsLink)

    await expect(screen.findByText('analytics-route')).resolves.toBeTruthy()
  })

  it('router context では内部リンクが app.html ではなく route を指す', () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
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
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/analytics']} />)

    await expect(screen.findByText('analytics-route')).resolves.toBeTruthy()
  })

  it('options route を開ける', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/options']} />)

    await expect(screen.findByText('options-route')).resolves.toBeTruthy()
  })

  it('ai-chat route を開ける', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/ai-chat']} />)

    await expect(screen.findByText('ai-chat-route')).resolves.toBeTruthy()
  })

  it('periodic-execution route を開ける', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/periodic-execution']} />)

    await expect(
      screen.findByText('periodic-execution-route'),
    ).resolves.toBeTruthy()
  })

  it('SavedTabsRoute から別 mode を選ぶと replace navigate する', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    fireEvent.click(screen.getByRole('button', { name: 'navigate-custom' }))

    await expect(
      screen.findByText('saved-tabs-route:?mode=custom'),
    ).resolves.toBeTruthy()
  })

  it('SavedTabsRoute から同じ mode を選んだ場合は再 navigate しない', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    fireEvent.click(screen.getByRole('button', { name: 'navigate-domain' }))

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
  })

  it('mode 指定が無い saved-tabs route は domain で開く', async () => {
// eslint-disable-next-line typescript/require-await
    const remove = vi.fn(async () => undefined)
    globalThis.chrome = {
      storage: {
        local: {
          remove,
        },
      },
    } as unknown as typeof chrome

// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/saved-tabs']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
    expect(remove).toHaveBeenCalledWith('viewMode')
  })

  it('不明なルートは domain で開く', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AppRouter initialEntries={['/unknown']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
  })

  it('initialEntries が無い場合は HashRouter を使う', async () => {
    window.history.replaceState({}, '', '/app.html#/saved-tabs?mode=custom')

    render(<AppRouter />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=custom'),
    ).resolves.toBeTruthy()
  })
})

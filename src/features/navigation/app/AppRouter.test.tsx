// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const routeModuleLoads = vi.hoisted(() => ({
  aiChat: 0,
}))

vi.mock('@/hooks/useMobile', () => ({
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

vi.mock('@/contexts/saved-tabs/presentation/routes/SavedTabsRoute', () => ({
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

vi.mock('@/app/composition/PersistenceMigrationNotice', () => ({
  PersistenceMigrationNotice: () => <div>persistence-migration-notice</div>,
}))

import { AppRouter } from './AppRouter'

describe('AppRouter', () => {
  beforeEach(() => {
    // The lazy route-module load counter is module-level and accumulates
    // across tests; reset it so load-count assertions are order-independent.
    routeModuleLoads.aiChat = 0
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('saved-tabs 初期表示では ai-chat route module を読み込まない', async () => {
    expect(routeModuleLoads.aiChat).toBe(0)

    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
    expect(routeModuleLoads.aiChat).toBe(0)
  })

  it('migration notice は saved-tabs route でのみ描画する', async () => {
    const { unmount } = render(
      <AppRouter initialEntries={['/saved-tabs?mode=domain']} />,
    )

    await expect(
      screen.findByText('persistence-migration-notice'),
    ).resolves.toBeTruthy()

    unmount()
    render(<AppRouter initialEntries={['/options']} />)

    expect(screen.queryByText('persistence-migration-notice')).toBeNull()
  })

  it('ルートパスは domain mode の saved-tabs に redirect する', async () => {
    render(<AppRouter initialEntries={['/']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
  })

  it('サイドバークリックで SPA 遷移する', async () => {
    const user = userEvent.setup()
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    const analyticsLink = screen.getAllByRole('link', {
      name: '分析',
    })[0]
    if (!analyticsLink) {
      throw new Error('分析リンクが見つかりません')
    }

    await user.click(analyticsLink)

    await expect(screen.findByText('analytics-route')).resolves.toBeTruthy()
  })

  it('router context では内部リンクが app.html ではなく route を指す', async () => {
    const user = userEvent.setup()
    render(<AppRouter initialEntries={['/saved-tabs?mode=custom']} />)

    await user.click(screen.getByRole('button', { name: 'サイドバーを開く' }))

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

    await expect(screen.findByText('analytics-route')).resolves.toBeTruthy()
  })

  it('options route を開ける', async () => {
    render(<AppRouter initialEntries={['/options']} />)

    await expect(screen.findByText('options-route')).resolves.toBeTruthy()
  })

  it('ai-chat route を開ける', async () => {
    render(<AppRouter initialEntries={['/ai-chat']} />)

    await expect(screen.findByText('ai-chat-route')).resolves.toBeTruthy()
  })

  it('periodic-execution route を開ける', async () => {
    render(<AppRouter initialEntries={['/periodic-execution']} />)

    await expect(
      screen.findByText('periodic-execution-route'),
    ).resolves.toBeTruthy()
  })

  it('SavedTabsRoute から別 mode を選ぶと replace navigate する', async () => {
    const user = userEvent.setup()
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    await user.click(screen.getByRole('button', { name: 'navigate-custom' }))

    await expect(
      screen.findByText('saved-tabs-route:?mode=custom'),
    ).resolves.toBeTruthy()
  })

  it('SavedTabsRoute から同じ mode を選んだ場合は再 navigate しない', async () => {
    const user = userEvent.setup()
    render(<AppRouter initialEntries={['/saved-tabs?mode=domain']} />)

    await screen.findByText('saved-tabs-route:?mode=domain')
    await user.click(screen.getByRole('button', { name: 'navigate-domain' }))

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
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

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
    expect(remove).toHaveBeenCalledWith('viewMode')
  })

  it('部分的な chrome API でも saved-tabs route を初期化できる', async () => {
    vi.stubGlobal('chrome', { storage: {} })

    render(<AppRouter initialEntries={['/saved-tabs']} />)

    await expect(
      screen.findByText('saved-tabs-route:?mode=domain'),
    ).resolves.toBeTruthy()
  })

  it('不明なルートは domain で開く', async () => {
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

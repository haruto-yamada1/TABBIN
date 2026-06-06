// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const sidebarContextValue = {
  open: true,
  setOpen: vi.fn(),
  sidebarWidth: 256,
  setSidebarWidth: vi.fn(),
  isMobile: false,
  state: 'expanded' as 'expanded' | 'collapsed',
  toggleSidebar: vi.fn(),
}

vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid='sidebar'>{children}</aside>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sidebar-content'>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <footer data-testid='sidebar-footer'>{children}</footer>
  ),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => (asChild ? children : <div>{children}</div>),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuSubButton: ({
    children,
    asChild,
    href,
  }: {
    children: React.ReactNode
    asChild?: boolean
    href?: string
  }) => (asChild ? children : <a href={href}>{children}</a>),
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSidebar: () => sidebarContextValue,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'savedTabs.viewMode.custom': 'Custom mode',
          'savedTabs.viewMode.domain': 'Domain mode',
          'sidebar.analytics': '分析',
          'sidebar.chat': 'チャット',
          'sidebar.collapse': 'サイドバーを小さくする',
          'sidebar.open': 'サイドバーを開く',
          'sidebar.options': 'オプション',
          'sidebar.periodicExecution': '定期実行',
          'sidebar.tabList': 'タブ一覧',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

import { ExtensionSidebar } from './ExtensionSidebar'

describe('ExtensionSidebar', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    sidebarContextValue.open = true
    sidebarContextValue.sidebarWidth = 256
  })

  it('shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './ExtensionSidebar.tsx'),
      'utf8',
    )

    expect(source).toContain("from '@/components/ui/button'")
    expect(source).not.toContain('<button')
  })

  it('タブ一覧を先頭に表示し、オプションをフッター最下部の内部ナビとして表示する', () => {
    render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    const content = screen.getByTestId('sidebar-content')
    const footer = screen.getByTestId('sidebar-footer')

    expect(content.querySelectorAll('section')).toHaveLength(1)
    expect(content.firstChild?.textContent).toContain('タブ一覧')
    expect(content.textContent).toContain('チャット')
    expect(content.textContent).toContain('分析')
    expect(content.textContent).toContain('定期実行')
    expect(footer.textContent).toContain('オプション')
    expect(
      screen.getByRole('link', { name: 'オプション' }).getAttribute('href'),
    ).toBe('app.html#/options')
  })

  it('options が active のときオプションだけを current page にする', () => {
    render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'options',
        }}
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'オプション' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen.getByRole('link', { name: '分析' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('タブ一覧の親アイコンは共通入口へ飛ぶ', () => {
    const { container } = render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-custom',
        }}
      />,
    )

    const tabListLinks = container.querySelectorAll('a[href^="app.html#"]')

    expect(tabListLinks[0]?.getAttribute('href')).toBe('app.html#/saved-tabs')
  })

  it('saved tabs submenu labels also come from i18n keys', () => {
    render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    expect(screen.getByRole('link', { name: 'Domain mode' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Custom mode' })).toBeTruthy()
  })

  it('縮小時は専用 icon rail として同一サイズのボタンを表示する', () => {
    sidebarContextValue.sidebarWidth = 48

    const { container } = render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    const sidebar = within(container)
    const iconHeaderTrigger = screen.getByRole('button', {
      name: 'サイドバーを開く',
    })
    const tabListLink = sidebar
      .getAllByRole('link', { name: 'タブ一覧' })
      .at(-1)
    const chatLink = sidebar.getAllByRole('link', { name: 'チャット' }).at(-1)
    const analyticsLink = sidebar.getAllByRole('link', { name: '分析' }).at(-1)
    const periodicLink = sidebar
      .getAllByRole('link', { name: '定期実行' })
      .at(-1)
    const optionLink = sidebar
      .getAllByRole('link', { name: 'オプション' })
      .at(-1)

    expect(iconHeaderTrigger.className).toContain('size-11')
    expect(iconHeaderTrigger.compareDocumentPosition(tabListLink as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    for (const link of [
      tabListLink,
      chatLink,
      analyticsLink,
      periodicLink,
      optionLink,
    ]) {
      expect(link?.className).toContain('size-11')
      expect(link?.className).toContain('items-center')
      expect(link?.className).toContain('justify-center')
    }

    expect(tabListLink?.getAttribute('href')).toBe('app.html#/saved-tabs')
    expect(tabListLink?.getAttribute('aria-current')).toBe('page')
    expect(chatLink?.getAttribute('aria-current')).toBeNull()
    expect(analyticsLink?.getAttribute('aria-current')).toBeNull()
    expect(periodicLink?.getAttribute('aria-current')).toBeNull()

    sidebarContextValue.sidebarWidth = 256
  })

  it('縮小ヘッダーの開くボタンは固定でサイドバーを開いて幅を通常幅へ戻す', () => {
    sidebarContextValue.sidebarWidth = 48
    sidebarContextValue.open = true

    render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'サイドバーを開く' }))

    expect(sidebarContextValue.setSidebarWidth).toHaveBeenCalledWith(256)
    expect(sidebarContextValue.setOpen).toHaveBeenCalledWith(true)
    expect(sidebarContextValue.toggleSidebar).not.toHaveBeenCalled()

    sidebarContextValue.sidebarWidth = 256
    sidebarContextValue.open = true
  })

  it('通常幅ではヘッダーに開くボタンを表示しない', () => {
    sidebarContextValue.sidebarWidth = 256

    const { container } = render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'サイドバーを開く' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'サイドバーを小さくする' }),
    ).not.toBeNull()
    expect(container.querySelector('header > div')?.className).toContain(
      'justify-between',
    )
  })

  it('通常幅ヘッダーの縮小ボタンは icon rail 幅まで戻す', () => {
    sidebarContextValue.sidebarWidth = 256

    render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'saved-tabs-domain',
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'サイドバーを小さくする' }),
    )

    expect(sidebarContextValue.setSidebarWidth).toHaveBeenCalledWith(48)
    expect(sidebarContextValue.setOpen).toHaveBeenCalledWith(true)
    expect(sidebarContextValue.toggleSidebar).not.toHaveBeenCalled()
  })

  it('縮小時は active 項目をページごとに 1 つだけ切り替える', () => {
    sidebarContextValue.sidebarWidth = 48

    const { container, rerender } = render(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'analytics',
        }}
      />,
    )

    let sidebar = within(container)

    expect(
      sidebar
        .getAllByRole('link', { name: '分析' })
        .at(-1)
        ?.getAttribute('aria-current'),
    ).toBe('page')
    expect(
      sidebar
        .getAllByRole('link', { name: 'タブ一覧' })
        .at(-1)
        ?.getAttribute('aria-current'),
    ).toBeNull()

    rerender(
      <ExtensionSidebar
        state={{
          expandedGroup: 'tab-list',
          item: 'periodic-execution',
        }}
      />,
    )

    sidebar = within(container)

    expect(
      sidebar
        .getAllByRole('link', { name: '定期実行' })
        .at(-1)
        ?.getAttribute('aria-current'),
    ).toBe('page')
    expect(
      sidebar
        .getAllByRole('link', { name: '分析' })
        .at(-1)
        ?.getAttribute('aria-current'),
    ).toBeNull()

    sidebarContextValue.sidebarWidth = 256
  })
})

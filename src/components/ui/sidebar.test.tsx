// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMessage, resolveUiLanguage } from '@/features/i18n/lib/language'

const { useIsMobileMock } = vi.hoisted(() => ({
  useIsMobileMock: vi.fn(() => false),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}))

vi.mock('./sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sheet-root'>{children}</div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sheet-content'>{children}</div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar'

describe('Sidebar', () => {
  const resizeLabel = getMessage(
    resolveUiLanguage(window.navigator.language),
    'sidebar.resize',
  )

  beforeEach(() => {
    useIsMobileMock.mockReset()
    useIsMobileMock.mockReturnValue(false)
    window.localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('モバイルでも Sheet を使わずレイアウト内に描画する', () => {
    useIsMobileMock.mockReturnValue(true)

    const { container } = render(
      <SidebarProvider defaultOpen>
        <SidebarTrigger />
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    expect(screen.queryByTestId('sheet-root')).toBeNull()
    expect(container.querySelector('[data-sidebar="sidebar"]')).toBeTruthy()
  })

  it('デスクトップでも fixed 配置のオーバーレイを使わない', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    expect(container.querySelector('.fixed')).toBeNull()
    expect(container.textContent).toContain('main-content')
  })

  it('SidebarInset は内部スクロール用に高さを閉じる', () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const inset = screen.getByText('main-content').closest('main')
    expect(inset?.className.includes('min-h-0')).toBe(true)
    expect(inset?.className.includes('overflow-hidden')).toBe(true)
  })

  it('保存済みのサイドバー幅を初期値として使う', () => {
    window.localStorage.setItem('tabbin-extension-sidebar-width', '320')

    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const wrapper = container.firstElementChild as HTMLElement | null
    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('320px')
  })

  it('保存済み幅がない時はアイコン幅で開始する', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const wrapper = container.firstElementChild as HTMLElement | null
    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('48px')
  })

  it('SidebarProvider は viewport 高に固定して子の内部スクロールを許可する', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const wrapper = container.firstElementChild as HTMLElement | null
    expect(wrapper?.className.includes('h-svh')).toBe(true)
    expect(wrapper?.className.includes('overflow-hidden')).toBe(true)
  })

  it('icon 収縮時も SidebarContent は縦スクロールを維持する', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div data-sidebar='header'>header</div>
          <SidebarContent>content</SidebarContent>
          <div data-sidebar='footer'>footer</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const resizeHandle = screen.getByRole('button', {
      name: resizeLabel,
    })

    fireEvent.pointerDown(resizeHandle, {
      clientX: 256,
    })
    fireEvent.pointerMove(window, {
      clientX: 12,
    })
    fireEvent.pointerUp(window)

    const content = container.querySelector('[data-sidebar="content"]')

    expect(content?.className.includes('overflow-auto')).toBe(true)
    expect(
      content?.className.includes(
        'group-data-[collapsible=icon]:overflow-hidden',
      ),
    ).toBe(false)
  })

  it('ドラッグ最小値ではアイコン幅まで縮み、icon 状態になる', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const resizeHandle = screen.getByRole('button', {
      name: resizeLabel,
    })
    const wrapper = container.firstElementChild as HTMLElement | null
    const sidebarRoot = resizeHandle.closest('[data-side]')

    fireEvent.pointerDown(resizeHandle, {
      clientX: 256,
    })
    fireEvent.pointerMove(window, {
      clientX: 12,
    })
    fireEvent.pointerUp(window)

    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('48px')
    expect(window.localStorage.getItem('tabbin-extension-sidebar-width')).toBe(
      '48',
    )
    expect(sidebarRoot?.getAttribute('data-state')).toBe('collapsed')
    expect(sidebarRoot?.getAttribute('data-collapsible')).toBe('icon')
  })

  it('トグルでは完全に閉じて offcanvas 状態になる', () => {
    window.localStorage.setItem('tabbin-extension-sidebar-width', '48')

    render(
      <SidebarProvider defaultOpen>
        <SidebarTrigger />
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const trigger = screen.getByRole('button', {
      name: 'Toggle Sidebar',
    })
    const sidebarRoot = screen
      .getByRole('button', { name: resizeLabel })
      .closest('[data-side]')

    fireEvent.click(trigger)

    expect(sidebarRoot?.getAttribute('data-state')).toBe('collapsed')
    expect(sidebarRoot?.getAttribute('data-collapsible')).toBe('offcanvas')
  })

  it('ドラッグでサイドバー幅を変更して保存する', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>sidebar-content</div>
        </Sidebar>
        <SidebarInset>main-content</SidebarInset>
      </SidebarProvider>,
    )

    const resizeHandle = screen.getByRole('button', {
      name: resizeLabel,
    })
    const wrapper = container.firstElementChild as HTMLElement | null

    fireEvent.pointerDown(resizeHandle, {
      clientX: 256,
    })
    fireEvent.pointerMove(window, {
      clientX: 360,
    })
    fireEvent.pointerUp(window)

    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('360px')
    expect(window.localStorage.getItem('tabbin-extension-sidebar-width')).toBe(
      '360',
    )
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMessage, resolveUiLanguage } from '@/features/i18n/lib/language'

const mocked = vi.hoisted(() => ({
  setTheme: vi.fn(),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({
    setTheme: mocked.setTheme,
    theme: 'system',
  }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button onClick={onClick} type='button'>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

import { MemoryI18nProvider } from '@/features/i18n/context/MemoryI18nProvider'

import { ModeToggle } from './ModeToggle'

describe('ModeToggle', () => {
  afterEach(() => {
    cleanup()
  })

  it('absolute icon の位置基準になる relative ボタンを使う', () => {
    render(<ModeToggle />)
    const toggleLabel = getMessage(
      resolveUiLanguage(window.navigator.language),
      'theme.toggle',
    )

    expect(
      screen.getByRole('button', { name: toggleLabel }).className,
    ).toContain('relative')
  })

  it('UI言語設定が日本語のとき、ブラウザ言語に依らずテーマメニューが日本語になる', () => {
    render(
      <MemoryI18nProvider initialLanguage='ja'>
        <ModeToggle />
      </MemoryI18nProvider>,
    )

    expect(
      screen.getByRole('button', { name: 'テーマの切り替え' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ライトモード' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ダークモード' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'システム設定' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ユーザー設定' })).toBeTruthy()
  })

  it('UI言語設定が英語のとき、テーマメニューが英語になる', () => {
    render(
      <MemoryI18nProvider initialLanguage='en'>
        <ModeToggle />
      </MemoryI18nProvider>,
    )

    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'System setting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'User setting' })).toBeTruthy()
  })
})

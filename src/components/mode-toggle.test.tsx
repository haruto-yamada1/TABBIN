// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getMessage, resolveUiLanguage } from '@/features/i18n/lib/language'

const mocked = vi.hoisted(() => ({
  setTheme: vi.fn(),
}))

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    setTheme: mocked.setTheme,
    theme: 'system',
  }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
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
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
}))

import { ModeToggle } from './mode-toggle'

describe('ModeToggle', () => {
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
})

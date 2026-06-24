// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'

const viewModeI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: viewModeI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(viewModeI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (value: ViewMode) => void
    children: React.ReactNode
  }) => (
    <div data-testid='select-root' data-value={value}>
      <button onClick={() => onValueChange?.('custom')} type='button'>
        emit-custom
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='select-trigger'>{children}</div>
  ),
  SelectValue: ({
    children,
    placeholder,
  }: {
    children?: React.ReactNode
    placeholder?: string
  }) => <div data-testid='select-value'>{children ?? placeholder}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='select-content'>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <div data-testid={`select-item-${value}`}>{children}</div>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='tooltip-root'>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='tooltip-trigger'>{children}</div>
  ),
  TooltipContent: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <div data-testid='tooltip-content' data-class-name={className}>
      {children}
    </div>
  ),
}))

import { SavedTabsResponsiveLayoutProvider } from '@/contexts/saved-tabs/presentation/components/SavedTabsResponsiveLayoutContext'

import { ViewModeToggle } from './ViewModeToggle'

describe('ViewModeToggle', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    viewModeI18nState.language = 'ja'
  })

  it('domain モードの選択表示と tooltip/menu を描画し onChange を呼ぶ', () => {
    const onChange = vi.fn()

    render(<ViewModeToggle currentMode='domain' onChange={onChange} />)

    const value = within(screen.getByTestId('select-value'))
    expect(value.getByText('ドメインモード')).toBeTruthy()
    expect(screen.getByTestId('tooltip-content').textContent).toBe(
      '表示モード切り替え',
    )
    expect(screen.getByTestId('select-item-domain')).toBeTruthy()
    expect(screen.getByTestId('select-item-custom')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'emit-custom' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('custom')
  })

  it('custom モードの選択表示を描画する', () => {
    render(<ViewModeToggle currentMode='custom' onChange={vi.fn()} />)

    const value = within(screen.getByTestId('select-value'))
    expect(value.getByText('カスタムモード')).toBeTruthy()
  })

  it('未知モード値ではフォールバック文言を表示する', () => {
    render(
      <ViewModeToggle currentMode={'unknown' as ViewMode} onChange={vi.fn()} />,
    )

    expect(screen.getByTestId('select-value').textContent).toBe('表示モード')
  })

  it('renders English view mode labels when the display language is en', () => {
    viewModeI18nState.language = 'en'

    render(<ViewModeToggle currentMode='domain' onChange={vi.fn()} />)

    const value = within(screen.getByTestId('select-value'))
    expect(value.getByText('Domain mode')).toBeTruthy()
    expect(screen.getByTestId('tooltip-content').textContent).toBe(
      'Switch view mode',
    )
  })

  it('compact layout ではラベルを隠して tooltip を表示対象にする', () => {
    render(
      <SavedTabsResponsiveLayoutProvider isCompactLayout>
        <ViewModeToggle currentMode='domain' onChange={vi.fn()} />
      </SavedTabsResponsiveLayoutProvider>,
    )

    expect(
      screen.getAllByText('ドメインモード')[0]?.getAttribute('class'),
    ).toContain('hidden')
    expect(
      screen.getByTestId('tooltip-content').getAttribute('data-class-name'),
    ).toContain('block')
  })
})

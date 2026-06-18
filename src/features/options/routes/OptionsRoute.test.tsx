// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

import { OptionsRoute } from './OptionsRoute'
import {
  createResetFontSizeInputValueUpdater,
  resetFontSizeInputState,
  resetFontSizeInputValue,
} from './optionsRoute.helpers'

const optionsRouteMocks = vi.hoisted(() => ({
  handleColorChange: vi.fn(),
  handleResetColors: vi.fn(),
  settings: undefined as UserSettings | undefined,
  updateSetting: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () => <div>mode-toggle</div>,
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div>toaster</div>,
}))

vi.mock('@/features/i18n/components/LanguageSelect', () => ({
  LanguageSelect: () => <div>language-select</div>,
}))

vi.mock('@/features/options/ImportExportSettings', () => ({
  ImportExportSettings: () => <div>import-export-settings</div>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <select
      aria-label='click-behavior'
      onChange={(event) => onValueChange?.(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),

  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode
    value: string
  }) => <option value={value}>{children}</option>,

  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <>{placeholder}</>
  ),
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    id,
    onCheckedChange,
  }: {
    checked?: boolean
    id?: string
    onCheckedChange?: (checked: boolean) => void
  }) => (
    // eslint-disable-next-line jsx-a11y/control-has-associated-label
    <input
      checked={Boolean(checked)}
      id={id}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type='checkbox'
    />
  ),
}))

vi.mock('@/features/options/hooks/useColorSettings', () => ({
  useColorSettings: () => ({
    handleColorChange: optionsRouteMocks.handleColorChange,
    handleResetColors: optionsRouteMocks.handleResetColors,
  }),
}))

vi.mock('@/features/options/hooks/useSettings', () => ({
  useSettings: () => ({
    addExcludePattern: vi.fn(async () => false),
    excludePatternInput: '',
    handleExcludePatternInputChange: vi.fn(),
    isLoading: false,
    removeExcludePattern: vi.fn(),
    setSettings: vi.fn(),
    settings: optionsRouteMocks.settings,
    updateSetting: optionsRouteMocks.updateSetting,
  }),
}))

const createSettings = (
  override: Partial<UserSettings> = {},
): UserSettings => ({
  autoDeletePeriod: 'never',
  clickBehavior: 'saveSameDomainTabs',
  colors: {},
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: ['chrome://', '  ', 'https://example.com'],
  excludePinnedTabs: true,
  fontSizePercent: 100,
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: true,
  removeTabAfterOpen: true,
  showSavedTime: false,
  ...override,
})

describe('OptionsRoute', () => {
  it('font size helper は input value だけを既定値へ戻す', () => {
    expect(
      resetFontSizeInputValue(
        {
          fontSizeInputValue: '',
          other: 'keep',
        },
        120,
      ),
    ).toStrictEqual({
      fontSizeInputValue: '120',
      other: 'keep',
    })
    expect(
      createResetFontSizeInputValueUpdater(110)({
        fontSizeInputValue: '90',
      }),
    ).toStrictEqual({
      fontSizeInputValue: '110',
    })
    const setValues = vi.fn()
    resetFontSizeInputState(setValues, 100)
    const updater = setValues.mock.calls[0]?.[0] as (values: {
      fontSizeInputValue: string
    }) => {
      fontSizeInputValue: string
    }
    expect(updater({ fontSizeInputValue: '90' })).toStrictEqual({
      fontSizeInputValue: '100',
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    optionsRouteMocks.settings = createSettings()
    optionsRouteMocks.updateSetting.mockResolvedValue(true)
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://tabbin/${path}`),
      },
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders settings sections and commits font size controls', async () => {
    render(<OptionsRoute />)

    expect(screen.getByText('options.title')).toBeTruthy()
    expect(screen.getByText('import-export-settings')).toBeTruthy()

    const slider = screen.getByLabelText('options.fontSize.rangeLabel')
    fireEvent.change(slider, { target: { value: '125' } })
    fireEvent.keyUp(slider, { key: 'Tab' })
    expect(optionsRouteMocks.updateSetting).not.toHaveBeenCalledWith(
      'fontSizePercent',
      125,
    )

    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(optionsRouteMocks.updateSetting).toHaveBeenCalledWith(
        'fontSizePercent',
        125,
      )
    })
    fireEvent.change(slider, { target: { value: '130' } })
    fireEvent.touchEnd(slider)
    fireEvent.change(slider, { target: { value: '135' } })
    fireEvent.blur(slider)
    await waitFor(() => {
      expect(optionsRouteMocks.updateSetting).toHaveBeenCalledWith(
        'fontSizePercent',
        135,
      )
    })

    const input = screen.getByLabelText('options.fontSize.inputLabel')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('100')

    fireEvent.change(input, { target: { value: 'not-number' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((input as HTMLInputElement).value).toBe('100')

    fireEvent.change(input, { target: { value: 'NaN' } })
    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('100')

    fireEvent.change(input, { target: { value: 'not-number' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect((input as HTMLInputElement).value).toBe('')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect((input as HTMLInputElement).value).toBe('100')
  })

  it('updates behavior, color, reset, exclude removal, and external links', async () => {
    render(<OptionsRoute />)

    fireEvent.change(screen.getByLabelText('click-behavior'), {
      target: { value: 'saveCurrentTab' },
    })
    expect(optionsRouteMocks.updateSetting).toHaveBeenCalledWith(
      'clickBehavior',
      'saveCurrentTab',
    )

    fireEvent.click(screen.getByLabelText('options.autoDelete.openAfter'))
    expect(optionsRouteMocks.updateSetting).toHaveBeenCalledWith(
      'removeTabAfterOpen',
      false,
    )

    fireEvent.change(screen.getAllByDisplayValue(/^#/)[0], {
      target: { value: '#123456' },
    })
    expect(optionsRouteMocks.handleColorChange).toHaveBeenCalled()

    fireEvent.click(screen.getAllByText('common.reset')[0])
    expect(optionsRouteMocks.updateSetting).toHaveBeenCalledWith(
      'fontSizePercent',
      100,
    )

    fireEvent.click(screen.getAllByText('common.reset')[1])
    expect(optionsRouteMocks.handleResetColors).toHaveBeenCalled()

    fireEvent.click(screen.getByText('options.contact'))
    fireEvent.click(screen.getByText('options.releaseNotes'))

    expect(window.open).toHaveBeenCalledWith(
      'https://forms.gle/c9gBiF2TmgXaeU7J6',
      '_blank',
      'noopener,noreferrer',
    )
    expect(window.open).toHaveBeenCalledWith(
      'chrome-extension://tabbin/changelog.html',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('clickBehavior 欠損時は既定値を使い、除外パターンが空なら空状態を表示する', () => {
    optionsRouteMocks.settings = createSettings({
      clickBehavior: undefined,
      excludePatterns: ['  '],
    })

    render(<OptionsRoute />)
    expect(
      (screen.getByLabelText('click-behavior') as HTMLInputElement).value,
    ).toBe('saveWindowTabs')
    expect(screen.getByText('options.excludePatterns.empty')).toBeTruthy()
  })
})

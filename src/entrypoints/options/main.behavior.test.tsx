// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { OptionsPage } from '@/features/options/routes/OptionsRoute'
import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  addExcludePattern: vi.fn(),
  confirmationConfirm: vi.fn(),
  handleCategoryKeyDown: vi.fn(),
  handleColorChange: vi.fn(),
  handleExcludePatternInputChange: vi.fn(),
  handleResetColors: vi.fn(),
  handleResetFontSize: vi.fn(),
  handleSelectAutoDelete: vi.fn(),
  handleSelectClickBehavior: vi.fn(),
  hideConfirmation: vi.fn(),
  inputProps: [] as Record<string, unknown>[],
  removeExcludePattern: vi.fn(),
  selectContentProps: [] as Record<string, unknown>[],
  setExcludePatternInput: vi.fn(),
  setSettings: vi.fn(),
  settings: {
    autoDeletePeriod: 'never',
    clickBehavior: 'saveSameDomainTabs',
    colors: {},
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    enableCategories: true,
    excludePatterns: ['chrome://'],
    excludePinnedTabs: false,
    fontSizePercent: 100,
    ollamaModel: 'llama3.2',
    openAllInNewWindow: false,
    openUrlInBackground: false,
    removeTabAfterExternalDrop: false,
    removeTabAfterOpen: false,
    showSavedTime: false,
  } as UserSettings,
  updateSetting: vi.fn(),
  useAutoDeletePeriodResult: {
    confirmationState: {
      isVisible: true,
      message: '確認メッセージ',
      onConfirm: vi.fn(),
    },
    handleAutoDeletePeriodChange: vi.fn(),
    hideConfirmation: vi.fn(),
    pendingAutoDeletePeriod: null,
    prepareAutoDeletePeriod: vi.fn(),
  },
  useSettingsResult: {
    addExcludePattern: vi.fn(),
    excludePatternInput: '',
    handleExcludePatternInputChange: vi.fn(),
    isLoading: false,
    removeExcludePattern: vi.fn(),
    setSettings: vi.fn(),
    settings: {} as UserSettings,
    setExcludePatternInput: vi.fn(),
    updateSetting: vi.fn(),
  },
}))

vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () => createElement('div', null, 'ModeToggle'),
}))

vi.mock('@/features/i18n/components/LanguageSelect', () => ({
  LanguageSelect: () => createElement('div', null, 'LanguageSelect'),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    type = 'button',
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    type?: 'button' | 'submit'
  } & Record<string, unknown>) => (
    // eslint-disable-next-line react/button-has-type
    <button onClick={onClick} type={type} {...props}>
      {children}
    </button>
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
      id={id}
      type='checkbox'
      checked={checked}
      // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => {
    mocked.inputProps.push(props)
    return <input {...props} />
  },
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    htmlFor,
    ...props
  }: {
    children: React.ReactNode
    htmlFor?: string
  } & Record<string, unknown>) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <div>
      <button
        data-testid='mock-select-change'
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() =>
          onValueChange?.(value === 'never' ? '30days' : 'saveWindowTabs')
        }
        type='button'
      >
        change-select
      </button>
      {children}
    </div>
  ),
  SelectContent: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  } & Record<string, unknown>) => {
    mocked.selectContentProps.push(props)
    return <div>{children}</div>
  },
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  } & Record<string, unknown>) => <div {...props}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => createElement('div', null, 'Toaster'),
}))

vi.mock('@/features/options/ImportExportSettings', () => ({
  ImportExportSettings: () =>
    createElement('div', null, 'ImportExportSettings'),
}))

vi.mock('@/features/options/hooks/useSettings', () => ({
  useSettings: () => mocked.useSettingsResult,
}))

vi.mock('@/features/options/hooks/useColorSettings', () => ({
  useColorSettings: () => ({
    handleColorChange: mocked.handleColorChange,
    handleResetColors: mocked.handleResetColors,
  }),
}))

vi.mock('@/features/options/hooks/useCategories', () => ({
  useCategories: () => ({
    handleCategoryKeyDown: mocked.handleCategoryKeyDown,
  }),
}))

vi.mock('@/features/options/hooks/useAutoDeletePeriod', () => ({
  useAutoDeletePeriod: () => mocked.useAutoDeletePeriodResult,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      const messages: Record<string, string> = {
        'common.reset': 'Reset',
        'common.loading': 'Loading...',
        'options.autoDelete.allWindows': 'Open all tabs in a new window',
        'options.autoDelete.allWindowsDescription':
          'When enabled, the "Open all" button opens tabs in a new window.',
        'options.autoDelete.background': 'Open in background tabs',
        'options.autoDelete.confirmDeleteAll': 'Confirm before deleting all',
        'options.autoDelete.confirmDeleteAllDescription':
          'When enabled, a confirmation dialog appears before deleting all tabs in a category.',
        'options.autoDelete.confirmDeleteEach': 'Confirm before deleting tabs',
        'options.autoDelete.confirmDeleteEachDescription':
          'When enabled, a confirmation dialog appears before deleting a tab.',
        'options.autoDelete.description':
          'Saved tabs are deleted automatically after the selected period.',
        'options.autoDelete.externalDrop':
          'Delete automatically after dropping into another browser',
        'options.autoDelete.externalDropDescription':
          'When enabled, saved tabs are removed after you drag and drop them into another browser.',
        'options.autoDelete.excludePinned': 'Exclude pinned tabs',
        'options.autoDelete.excludePinnedDescription':
          'When enabled, pinned tabs are excluded from saved tabs.',
        'options.autoDelete.openAfter':
          'Delete automatically after opening a saved tab',
        'options.autoDelete.openAfterDescription':
          'When enabled, a saved tab is removed from the list after you open it. When disabled, the tab stays in the list.',
        'options.autoDelete.periodLabel': 'Auto-delete period for tabs',
        'options.autoDelete.savedTime': 'Show saved time',
        'options.autoDelete.savedTimeDescription':
          'When enabled, the saved date is shown in the saved tabs list.',
        'options.autoDelete.saveInBackground': 'Open in background tabs',
        'options.autoDelete.saveInBackgroundDescription':
          'When enabled, saved tabs open in the background.',
        'options.autoDelete.selectPlaceholder': 'Select an auto-delete period',
        'options.autoDelete.shorterWarning':
          'Warning: This shortens the current period, so some tabs may be deleted immediately!',
        'options.autoDelete.validateWarning':
          'Note: Tabs older than the selected period may be deleted immediately.',
        'options.autoDelete.periodDescription':
          'Saved tabs are deleted automatically when they exceed the selected period. Applying the setting deletes tabs that have already expired.',
        'options.autoDelete.zero': 'Do not auto delete',
        'options.backupRestore': 'Backup & Restore',
        'options.behavior.description':
          'When enabled, tabs are opened in a new window.',
        'options.behaviorSettings': 'Tab behavior',
        'options.clickBehavior.allWindows':
          'Save all tabs including other windows',
        'options.clickBehavior.currentTab': 'Save current tab',
        'options.clickBehavior.sameDomain':
          'Save all tabs from the current domain',
        'options.clickBehavior.windowTabs': 'Save all tabs in the window',
        'options.clickBehaviorLabel': 'Click action',
        'options.clickBehaviorPlaceholder': 'Select click action',
        'options.color.background': 'Background',
        'options.color.border': 'Border',
        'options.color.card': 'Card background',
        'options.color.cardForeground': 'Card text',
        'options.color.chart1': 'Chart 1',
        'options.color.chart2': 'Chart 2',
        'options.color.chart3': 'Chart 3',
        'options.color.chart4': 'Chart 4',
        'options.color.chart5': 'Chart 5',
        'options.color.destructive': 'Destructive background',
        'options.color.destructiveForeground': 'Destructive text',
        'options.color.foreground': 'Text',
        'options.color.hexPlaceholder': 'e.g. #FF5733, #3366CC',
        'options.color.input': 'Input background',
        'options.color.muted': 'Muted background',
        'options.color.mutedForeground': 'Sub text',
        'options.color.popover': 'Popover',
        'options.color.popoverForeground': 'Popover text',
        'options.color.primary': 'Primary background',
        'options.color.primaryForeground': 'Primary text',
        'options.color.ring': 'Ring',
        'options.color.secondary': 'Secondary background',
        'options.color.secondaryForeground': 'Secondary text',
        'options.color.sidebar': 'Sidebar background',
        'options.color.sidebarAccent': 'Sidebar accent background',
        'options.color.sidebarAccentForeground': 'Sidebar accent text',
        'options.color.sidebarBorder': 'Sidebar border',
        'options.color.sidebarForeground': 'Sidebar text',
        'options.color.sidebarPrimary': 'Sidebar primary background',
        'options.color.sidebarPrimaryForeground': 'Sidebar primary text',
        'options.color.sidebarRing': 'Sidebar ring',
        'options.contact': 'Contact',
        'options.contactDescription':
          'Google Forms is used. A Google account is required because image uploads are enabled.',
        'options.fontSize.currentValue': 'Current value',
        'options.fontSize.description':
          'Adjust the font size used across the extension.',
        'options.fontSize.inputLabel': 'Font size percentage',
        'options.fontSize.rangeLabel': 'Font size slider',
        'options.excludePatterns.add': 'Add',
        'options.excludePatterns.empty': 'No exclude patterns',
        'options.excludePatterns.help':
          'Matching URLs are not saved and tabs are not closed.',
        'options.excludePatterns.label':
          'URLs that should not be saved or closed',
        'options.excludePatterns.placeholder': 'e.g. chrome-extension://',
        'options.excludePatterns.title': 'Exclude settings',
        'options.excludePatterns.removeAria':
          'Remove exclude pattern {{pattern}}',
        'options.previewColorCustomization': '(preview) Color customization',
        'options.previewFontSizeCustomization': '(preview) Font size',
        'options.previewColorCustomizationReset': 'Reset',
        'options.releaseNotes': 'Release Notes',
        'options.showSavedTimeDescription':
          'When enabled, the saved date is shown in the saved tabs list.',
        'options.title': 'Options',
      }

      const template = messages[key] ?? fallback ?? key

      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_match: string, token: string) => values?.[token] ?? '',
      )
    },
  }),
}))

const importBootstrapModule = async () => {
  vi.resetModules()
  return import('./main')
}

const resetHookState = () => {
  mocked.updateSetting.mockResolvedValue(true)
  mocked.handleColorChange.mockReset()
  mocked.handleResetColors.mockReset()
  mocked.handleResetFontSize.mockReset()
  mocked.hideConfirmation.mockReset()
  mocked.inputProps = []
  mocked.selectContentProps = []
  mocked.addExcludePattern.mockResolvedValue(true)
  mocked.removeExcludePattern.mockResolvedValue(undefined)
  mocked.useSettingsResult = {
    addExcludePattern: mocked.addExcludePattern,
    excludePatternInput: '',
    handleExcludePatternInputChange: mocked.handleExcludePatternInputChange,
    isLoading: false,
    removeExcludePattern: mocked.removeExcludePattern,
    setSettings: mocked.setSettings,
    settings: mocked.settings,
    setExcludePatternInput: mocked.setExcludePatternInput,
    updateSetting: mocked.updateSetting,
  }
  mocked.useAutoDeletePeriodResult = {
    confirmationState: {
      isVisible: true,
      message: '確認メッセージ',
      onConfirm: mocked.confirmationConfirm,
    },
    handleAutoDeletePeriodChange: mocked.handleSelectAutoDelete,
    hideConfirmation: mocked.hideConfirmation,
    pendingAutoDeletePeriod: null,
    prepareAutoDeletePeriod: vi.fn(),
  }
}

describe('options route behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHookState()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://id/${path}`),
      },
    } as unknown as typeof chrome
    vi.spyOn(window, 'open').mockImplementation(vi.fn() as never)
  })

  afterEach(() => {
    cleanup()
  })

  it('loading 中はローディング表示を返す', () => {
    mocked.useSettingsResult.isLoading = true

    render(createElement(OptionsPage))

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('clickBehavior の select を変更すると updateSetting が呼ばれる', () => {
    render(createElement(OptionsPage))

    expect(screen.queryByText('Current value')).toBeNull()

    fireEvent.click(screen.getAllByTestId('mock-select-change')[0])
    expect(mocked.updateSetting).toHaveBeenCalledWith(
      'clickBehavior',
      'saveWindowTabs',
    )
  })

  it('auto delete 系の checkbox を変更すると updateSetting が呼ばれる', () => {
    render(createElement(OptionsPage))

    fireEvent.click(
      screen.getByLabelText('Delete automatically after opening a saved tab'),
    )
    fireEvent.click(
      screen.getByLabelText(
        'Delete automatically after dropping into another browser',
      ),
    )
    fireEvent.click(screen.getByLabelText('Exclude pinned tabs'))
    fireEvent.click(screen.getByLabelText('Open in background tabs'))
    fireEvent.click(screen.getByLabelText('Open all tabs in a new window'))
    fireEvent.click(screen.getByLabelText('Show saved time'))
    fireEvent.click(screen.getByLabelText('Confirm before deleting tabs'))
    fireEvent.click(screen.getByLabelText('Confirm before deleting all'))

    expect(mocked.updateSetting).toHaveBeenCalledWith(
      'removeTabAfterOpen',
      true,
    )
    expect(mocked.updateSetting).toHaveBeenCalledWith(
      'removeTabAfterExternalDrop',
      true,
    )
    expect(mocked.updateSetting).toHaveBeenCalledWith('excludePinnedTabs', true)
    expect(mocked.updateSetting).toHaveBeenCalledWith(
      'openUrlInBackground',
      true,
    )
    expect(mocked.updateSetting).toHaveBeenCalledWith(
      'openAllInNewWindow',
      true,
    )
    expect(mocked.updateSetting).toHaveBeenCalledWith('showSavedTime', true)
    expect(mocked.updateSetting).toHaveBeenCalledWith('confirmDeleteEach', true)
    expect(mocked.updateSetting).toHaveBeenCalledWith('confirmDeleteAll', true)
  })

  it('exclude pattern を blur / Add ボタン / Enter / Remove ボタンで追加・削除できる', () => {
    render(createElement(OptionsPage))

    const excludeInput = screen.getByPlaceholderText('e.g. chrome-extension://')
    fireEvent.change(excludeInput, {
      target: { value: 'https://example.com' },
    })
    expect(mocked.handleExcludePatternInputChange).toHaveBeenCalledTimes(1)
    fireEvent.blur(excludeInput)
    expect(mocked.addExcludePattern).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(mocked.addExcludePattern).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(excludeInput, { key: 'Enter' })
    expect(mocked.addExcludePattern).toHaveBeenCalledTimes(3)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove exclude pattern chrome://',
      }),
    )
    expect(mocked.removeExcludePattern).toHaveBeenCalledWith('chrome://')
  })

  it('font size slider / input / Reset ボタンでフォントサイズを変更できる', () => {
    render(createElement(OptionsPage))

    const resetButtons = screen.getAllByRole('button', { name: 'Reset' })

    fireEvent.click(resetButtons[0])
    expect(mocked.updateSetting).toHaveBeenCalledWith('fontSizePercent', 100)

    const fontSizeSlider = screen.getByLabelText('Font size slider')
    const updateSettingCallCount = mocked.updateSetting.mock.calls.length

    fireEvent.change(fontSizeSlider, {
      target: { value: '125' },
    })
    expect(mocked.updateSetting).toHaveBeenCalledTimes(updateSettingCallCount)
    // eslint-disable-next-line typescript/TS2339
    expect(
      (screen.getByLabelText('Font size percentage') as HTMLInputElement).value,
    ).toBe('125')

    fireEvent.mouseUp(fontSizeSlider)
    expect(mocked.updateSetting).toHaveBeenCalledWith('fontSizePercent', 125)

    fireEvent.change(screen.getByLabelText('Font size percentage'), {
      target: { value: '501' },
    })
    fireEvent.blur(screen.getByLabelText('Font size percentage'))
    expect(mocked.updateSetting).toHaveBeenCalledWith('fontSizePercent', 500)
  })

  it('color input / hex input / Reset colors ボタンで色を変更できる', () => {
    render(createElement(OptionsPage))

    const resetButtons = screen.getAllByRole('button', { name: 'Reset' })

    fireEvent.click(resetButtons[1])
    expect(mocked.handleResetColors).toHaveBeenCalledTimes(1)

    const colorInput = document.querySelector('input[type="color"]')
    const hexInput = screen.getAllByPlaceholderText('e.g. #FF5733, #3366CC')[0]
    if (!colorInput) {
      throw new Error('color input not found')
    }
    fireEvent.input(colorInput, { target: { value: '#ffffff' } })
    fireEvent.change(colorInput, { target: { value: '#ffffff' } })
    fireEvent.change(hexInput, { target: { value: '#000000' } })

    expect(mocked.handleColorChange).toHaveBeenCalled()
  })

  it('Contact / Release Notes の外部リンクを noopener,noreferrer 付きで window.open する', () => {
    render(createElement(OptionsPage))

    fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Release Notes' }))

    expect(window.open).toHaveBeenCalledWith(
      'https://forms.gle/c9gBiF2TmgXaeU7J6',
      '_blank',
      'noopener,noreferrer',
    )
    expect(window.open).toHaveBeenCalledWith(
      'chrome-extension://id/changelog.html',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('Enter 以外のキー入力では除外パターンを追加しない', () => {
    render(createElement(OptionsPage))

    fireEvent.keyDown(
      screen.getAllByPlaceholderText('e.g. chrome-extension://')[0],
      {
        key: 'Escape',
      },
    )

    expect(mocked.addExcludePattern).not.toHaveBeenCalled()
  })
})

describe('options bootstrap redirect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('redirect helper は options entrypoint を app route へ変換する', async () => {
    const { redirectToApp } = await importBootstrapModule()
    const replace = vi.fn()

    expect(redirectToApp('/options.html', '', replace)).toBe(
      'app.html#/options',
    )
    expect(replace).toHaveBeenCalledWith('app.html#/options')
  })

  it('DOMContentLoaded の redirect handler を登録する', async () => {
    let domReadyHandler: EventListener | undefined

    vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string,
      callback: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === 'DOMContentLoaded' && typeof callback === 'function') {
        domReadyHandler = callback
      }
    }) as typeof document.addEventListener)

    await importBootstrapModule()

    expect(domReadyHandler).toBeTypeOf('function')
  })
})

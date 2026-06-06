// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  confirmationConfirm: vi.fn(),
  handleSelectAutoDelete: vi.fn(),
  hideConfirmation: vi.fn(),
  isLoading: false,
  prepareAutoDeletePeriod: vi.fn(),
  settings: {
    autoDeletePeriod: 'never',
    clickBehavior: 'saveSameDomainTabs',
    colors: {},
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    enableCategories: true,
    excludePatterns: [],
    excludePinnedTabs: true,
    ollamaModel: 'llama3.2',
    openAllInNewWindow: false,
    openUrlInBackground: true,
    removeTabAfterExternalDrop: true,
    removeTabAfterOpen: true,
    showSavedTime: false,
  } as UserSettings,
  setSettings: vi.fn(),
  selectContentProps: [] as Record<string, unknown>[],
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ref,
    type = 'button',
    ...props
  }: ComponentPropsWithoutRef<'button'> & {
    ref?: React.Ref<HTMLButtonElement>
  }) => (
    <button ref={ref} type={type} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  } & Record<string, unknown>) => <div {...props}>{children}</div>,
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
        onClick={() => onValueChange?.(value === 'never' ? '30days' : 'never')}
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

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'common.cancel': 'Cancel',
          'common.confirm': 'Confirm',
          'common.loading': 'Loading...',
          'common.loadingLabel': 'Loading',
          'options.autoDelete.allWindows': 'Open all tabs in a new window',
          'options.autoDelete.allWindowsDescription':
            'When enabled, the "Open all" button opens tabs in a new window.',
          'options.autoDelete.background': 'Open in background tabs',
          'options.autoDelete.confirmDeleteAll': 'Confirm before deleting all',
          'options.autoDelete.confirmDeleteAllDescription':
            'When enabled, a confirmation dialog appears before deleting all tabs in a category.',
          'options.autoDelete.confirmDeleteEach':
            'Confirm before deleting tabs',
          'options.autoDelete.confirmDeleteEachDescription':
            'When enabled, a confirmation dialog appears before deleting a tab.',
          'options.autoDelete.confirmMessage':
            'Set auto-delete period to "{{periodLabel}}".\n\n{{warningMessage}}\n\nContinue?',
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
          'options.autoDelete.periodDescription':
            'Saved tabs are deleted automatically when they exceed the selected period. Applying the setting deletes tabs that have already expired.',
          'options.autoDelete.periodLabel': 'Auto-delete period for tabs',
          'options.autoDelete.apply': 'Apply',
          'options.autoDelete.disabled': 'Disabled auto delete',
          'options.autoDelete.enabled':
            'Set auto-delete period to "{{periodLabel}}"',
          'options.autoDelete.savedTime': 'Show saved time',
          'options.autoDelete.savedTimeDescription':
            'When enabled, the saved date is shown in the saved tabs list.',
          'options.autoDelete.saveInBackground': 'Open in background tabs',
          'options.autoDelete.saveInBackgroundDescription':
            'When enabled, saved tabs open in the background.',
          'options.autoDelete.selectPlaceholder':
            'Select an auto-delete period',
          'options.autoDelete.shorterWarning':
            'Warning: This shortens the current period, so some tabs may be deleted immediately!',
          'options.autoDelete.validateWarning':
            'Note: Tabs older than the selected period may be deleted immediately.',
          'options.autoDelete.saveError': 'Failed to save settings',
          'options.autoDelete.zero': 'Do not auto delete',
          'options.autoDelete.title': 'Auto delete',
          'periodicExecution.title': 'Scheduled tasks',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock('@/features/options/hooks/useSettings', () => ({
  useSettings: () => ({
    handleExcludePatternsBlur: vi.fn(),
    handleExcludePatternsChange: vi.fn(),
    isLoading: mocked.isLoading,
    setSettings: mocked.setSettings,
    settings: mocked.settings,
    updateSetting: vi.fn(),
  }),
}))

vi.mock('@/features/options/hooks/useAutoDeletePeriod', () => ({
  useAutoDeletePeriod: () => ({
    confirmationState: {
      isVisible: true,
      message: '確認メッセージ',
      onConfirm: mocked.confirmationConfirm,
    },
    handleAutoDeletePeriodChange: mocked.handleSelectAutoDelete,
    hideConfirmation: mocked.hideConfirmation,
    pendingAutoDeletePeriod: null,
    prepareAutoDeletePeriod: mocked.prepareAutoDeletePeriod,
  }),
}))

import { PeriodicExecutionRoute } from './PeriodicExecutionRoute'

describe('PeriodicExecutionRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.selectContentProps = []
    mocked.isLoading = false
    mocked.settings = {
      autoDeletePeriod: 'never',
      clickBehavior: 'saveSameDomainTabs',
      colors: {},
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: [],
      excludePinnedTabs: true,
      ollamaModel: 'llama3.2',
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: true,
      removeTabAfterOpen: true,
      showSavedTime: false,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('定期実行ページと自動削除設定を表示する', () => {
    render(createElement(PeriodicExecutionRoute))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Scheduled tasks' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Auto delete' }),
    ).toBeTruthy()
    expect(screen.getByText('Auto-delete period for tabs')).toBeTruthy()
    expect(
      screen.getByText(
        'Saved tabs are deleted automatically after the selected period.',
      ),
    ).toBeTruthy()
  })

  it('自動削除期間が未設定なら never を選択値として扱う', () => {
    mocked.settings = {
      ...mocked.settings,
      autoDeletePeriod: undefined,
    } as UserSettings

    render(createElement(PeriodicExecutionRoute))

    fireEvent.click(screen.getAllByTestId('mock-select-change')[0])
    expect(mocked.handleSelectAutoDelete).toHaveBeenCalledWith('30days')
  })

  it('loading 中は spinner のみを表示する', () => {
    mocked.isLoading = true

    render(createElement(PeriodicExecutionRoute))

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('自動削除期間の変更と確認操作を処理する', () => {
    render(createElement(PeriodicExecutionRoute))

    fireEvent.click(screen.getAllByTestId('mock-select-change')[0])
    expect(mocked.handleSelectAutoDelete).toHaveBeenCalledWith('30days')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocked.prepareAutoDeletePeriod).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(mocked.hideConfirmation).toHaveBeenCalledTimes(1)
    expect(mocked.confirmationConfirm).toHaveBeenCalledTimes(1)
  })

  it('確認 UI を alertdialog として表示し、キャンセルボタンへ初期フォーカスを移す', () => {
    render(createElement(PeriodicExecutionRoute))

    const dialog = screen.getByRole('alertdialog')
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')

    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe(
      'Auto delete',
    )
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      '確認メッセージ',
    )
    expect(document.activeElement).toBe(cancelButton)
  })
})

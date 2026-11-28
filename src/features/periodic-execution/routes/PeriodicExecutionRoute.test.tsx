// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ComponentPropsWithoutRef, useState } from 'react'
import { assert, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMessage } from '@/features/i18n/lib/language'
import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
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
    protectFavoriteFromAutoRemoval: true,
    removeTabAfterOpen: true,
    showRelativeSavedTime: false,
    showSavedTime: false,
  } as UserSettings,
  setSettings: vi.fn(),
  selectContentProps: [] as Record<string, unknown>[],
  readReminderSettings: vi.fn(),
  saveReminderSettings: vi.fn(),
  getReviewCategories: vi.fn(),
  listExpired: vi.fn(),
  restoreExpired: vi.fn(),
  restoreExpiredWithUndo: vi.fn(),
  discardExpired: vi.fn(),
  subscribeExpired: vi.fn(),
}))

vi.mock('@/app/composition/expiredUrlRecovery', () => {
  const recovery = {
    list: mocked.listExpired,
    restore: mocked.restoreExpired,
    restoreWithUndo: mocked.restoreExpiredWithUndo,
    discard: mocked.discardExpired,
    subscribe: mocked.subscribeExpired,
  }
  return {
    EXPIRED_URL_RECOVERY_DAYS: 30,
    getExpiredUrlRecovery: () => recovery,
  }
})

vi.mock('@/lib/storage/review-reminders', () => ({
  readReviewReminderSettings: mocked.readReminderSettings,
  saveReviewReminderSettings: mocked.saveReminderSettings,
}))

vi.mock('@/app/composition/reviewReminders', () => ({
  getReviewCategories: mocked.getReviewCategories,
}))

vi.mock('@/lib/browser/runtime', () => ({
  getExtensionUrl: () => 'chrome-extension://tabbin/app.html',
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  buttonVariants: () => '',
  Button: ({
    children,
    ref,
    type = 'button',
    ...props
  }: ComponentPropsWithoutRef<'button'> & {
    ref?: React.Ref<HTMLButtonElement>
  }) => (
    // eslint-disable-next-line react/button-has-type
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
    language: 'en',
    t: (key: string, fallback?: string, values?: Record<string, string>) =>
      (
        {
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
          'options.autoDelete.saveError': 'Failed to save settings',
          'options.autoDelete.zero': 'Do not auto delete',
          'options.autoDelete.title': 'Auto delete',
          'periodicExecution.title': 'Scheduled tasks',
        } satisfies Record<string, string>
      )[key] ?? getMessage('en', key, fallback, values),
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

vi.mock('@/features/options/hooks/useAutoDeletePeriod', async () => {
  const React = await vi.importActual<{ useState: typeof useState }>('react')
  return {
    useAutoDeletePeriod: () => {
      const [isVisible, setIsVisible] = React.useState(false)
      return {
        confirmationState: {
          isVisible,
          message: '確認メッセージ',
          onConfirm: () => {
            mocked.confirmationConfirm()
            setIsVisible(false)
          },
        },
        handleAutoDeletePeriodChange: mocked.handleSelectAutoDelete,
        hideConfirmation: () => {
          mocked.hideConfirmation()
          setIsVisible(false)
        },
        pendingAutoDeletePeriod: null,
        prepareAutoDeletePeriod: () => {
          mocked.prepareAutoDeletePeriod()
          setIsVisible(true)
        },
      }
    },
  }
})

import { PeriodicExecutionRoute } from './PeriodicExecutionRoute'

const createExpiredGuide = () => {
  const dayInMs = 86_400_000
  const expiredAt = Date.now() - dayInMs
  return {
    id: 'expired-guide',
    title: 'Expired guide',
    url: 'https://guide.example/expired',
    expiredAt,
    recoverUntil: expiredAt + 30 * dayInMs,
    memberships: [
      { collectionName: 'guide.example' },
      { collectionName: 'Work', categoryName: 'Research' },
    ],
  }
}

const createExpiredArticle = () => ({
  ...createExpiredGuide(),
  id: 'expired-article',
  title: 'Expired article',
  url: 'https://guide.example/article',
})

describe('PeriodicExecutionRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.selectContentProps = []
    mocked.isLoading = false
    mocked.readReminderSettings.mockResolvedValue({
      ...defaultReviewReminderSettings,
    })
    mocked.saveReminderSettings.mockResolvedValue(undefined)
    mocked.getReviewCategories.mockResolvedValue([])
    mocked.listExpired.mockReset().mockResolvedValue([])
    mocked.restoreExpired.mockReset().mockResolvedValue(1)
    mocked.restoreExpiredWithUndo.mockReset().mockResolvedValue({ result: 1 })
    mocked.discardExpired.mockReset().mockResolvedValue(1)
    mocked.subscribeExpired.mockReset().mockReturnValue(() => {})
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
      protectFavoriteFromAutoRemoval: true,
      removeTabAfterOpen: true,
      showRelativeSavedTime: false,
      showSavedTime: false,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('定期実行ページに整理リマインダーと自動削除設定を表示する', async () => {
    render(createElement(PeriodicExecutionRoute))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Scheduled tasks' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Auto delete' }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('checkbox', { name: 'Enable review reminders' }),
    ).not.toBeChecked()
    expect(mocked.saveReminderSettings).not.toHaveBeenCalled()
    expect(screen.getByText('Auto-delete period for tabs')).toBeTruthy()
    expect(
      screen.getByText(
        'Saved tabs move to recovery after the selected period. When favorite protection is on, favorites are excluded.',
      ),
    ).toBeTruthy()
  })

  it('自動削除が無効でも元の所属と復元期限を確認し、個別と一括で復元できる', async () => {
    const user = userEvent.setup()
    const expiredGuide = createExpiredGuide()
    const expiredArticle = createExpiredArticle()
    mocked.listExpired
      .mockResolvedValueOnce([expiredGuide, expiredArticle])
      .mockResolvedValueOnce([expiredArticle])
    render(createElement(PeriodicExecutionRoute))

    const recovery = screen.getByRole('region', {
      name: 'Recover expired tabs',
    })
    expect(await within(recovery).findByText('Expired guide')).toBeVisible()
    expect(within(recovery).getByText(expiredGuide.url)).toBeVisible()
    expect(
      within(recovery).getByText('2 saved tabs available to restore'),
    ).toBeVisible()
    const guide = within(recovery).getByRole('listitem', {
      name: 'Expired guide',
    })
    expect(within(guide).getByText('guide.example')).toBeVisible()
    expect(within(guide).getByText('Work / Research')).toBeVisible()
    expect(within(guide).getByText('Removed on')).toBeVisible()
    expect(within(guide).getByText('Restore by')).toBeVisible()

    await user.click(
      within(guide).getByRole('button', { name: 'Restore Expired guide' }),
    )
    expect(mocked.restoreExpired).toHaveBeenLastCalledWith(['expired-guide'])
    expect(
      await within(recovery).findByText('1 saved tab available to restore'),
    ).toBeVisible()
    await user.click(
      within(recovery).getByRole('button', { name: 'Restore all' }),
    )
    expect(mocked.restoreExpiredWithUndo).toHaveBeenCalledExactlyOnceWith([
      'expired-article',
    ])
    expect(
      await within(recovery).findByText('No expired tabs to restore.'),
    ).toBeVisible()
  })

  it('完全削除は確認後に実行し、失敗後も項目を保持する', async () => {
    const user = userEvent.setup()
    mocked.listExpired.mockResolvedValue([createExpiredGuide()])
    mocked.discardExpired.mockRejectedValueOnce(new Error('unavailable'))
    render(createElement(PeriodicExecutionRoute))

    const remove = await screen.findByRole('button', {
      name: 'Permanently delete Expired guide',
    })
    await user.click(remove)
    const firstDialog = screen.getByRole('alertdialog')
    await user.click(
      within(firstDialog).getByRole('button', { name: 'Cancel' }),
    )
    expect(mocked.discardExpired).not.toHaveBeenCalled()

    await user.click(remove)
    const dialog = screen.getByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Permanently delete' }),
    )
    expect(mocked.discardExpired).toHaveBeenCalledWith(['expired-guide'])
    expect(
      await screen.findByText('Could not update expired tabs. Try again.'),
    ).toBeVisible()
    expect(screen.getByText('Expired guide')).toBeVisible()

    mocked.listExpired.mockResolvedValue([])
    await user.click(remove)
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Permanently delete',
      }),
    )
    expect(await screen.findByText('No expired tabs to restore.')).toBeVisible()
  })

  it('読み込みを再試行し、別画面からの変更を反映する', async () => {
    const user = userEvent.setup()
    const unsubscribe = vi.fn()
    mocked.subscribeExpired.mockReturnValue(unsubscribe)
    mocked.listExpired.mockRejectedValueOnce(new Error('unavailable'))
    const view = render(createElement(PeriodicExecutionRoute))

    expect(
      await screen.findByText('Could not load expired tabs.'),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Retry loading expired tabs' }),
    )
    expect(await screen.findByText('No expired tabs to restore.')).toBeVisible()

    mocked.listExpired.mockResolvedValue([createExpiredArticle()])
    const onChange = mocked.subscribeExpired.mock.calls[0]?.[0] as () => void
    act(onChange)
    expect(await screen.findByText('Expired article')).toBeVisible()
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('将来の時計でも有効な候補の読み込みを繰り返さない', async () => {
    vi.useFakeTimers({ now: new Date('2030-01-01T00:00:00Z') })
    try {
      mocked.listExpired.mockResolvedValue([createExpiredGuide()])
      render(createElement(PeriodicExecutionRoute))

      await act(async () => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Expired guide')).toBeVisible()
      await act(async () => vi.advanceTimersByTimeAsync(5))
      expect(mocked.listExpired).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('画面を開いたままでも復元期限を過ぎた候補を除く', async () => {
    vi.useFakeTimers()
    try {
      const oneSecondInMs = 1000
      mocked.listExpired.mockResolvedValueOnce([
        { ...createExpiredGuide(), recoverUntil: Date.now() + oneSecondInMs },
      ])
      render(createElement(PeriodicExecutionRoute))

      await act(async () => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Expired guide')).toBeVisible()
      await act(async () => vi.advanceTimersByTimeAsync(oneSecondInMs))
      expect(screen.getByText('No expired tabs to restore.')).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  it('移設したリマインダー設定を保存し、再表示時に読み込む', async () => {
    let persisted = { ...defaultReviewReminderSettings, hour: 15 }
    mocked.readReminderSettings.mockImplementation(async () => ({
      ...persisted,
    }))
    mocked.saveReminderSettings.mockImplementation(async (settings) => {
      persisted = { ...settings }
    })
    const user = userEvent.setup()
    const view = render(createElement(PeriodicExecutionRoute))
    const enabled = await screen.findByRole('checkbox', {
      name: 'Enable review reminders',
    })
    expect(screen.getByLabelText('Reminder hour')).toHaveValue('15')
    await user.click(enabled)
    await user.selectOptions(screen.getByLabelText('Frequency'), 'daily')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(await screen.findByText('Reminder settings saved.')).toBeVisible()
    view.unmount()
    render(createElement(PeriodicExecutionRoute))
    expect(
      await screen.findByRole('checkbox', {
        name: 'Enable review reminders',
      }),
    ).toBeChecked()
    expect(screen.getByLabelText('Frequency')).toHaveValue('daily')
    expect(screen.getByLabelText('Reminder hour')).toHaveValue('15')
    expect(mocked.prepareAutoDeletePeriod).not.toHaveBeenCalled()
  })

  it('自動削除期間が未設定なら never を選択値として扱う', async () => {
    const user = userEvent.setup()
    mocked.settings = {
      ...mocked.settings,
      autoDeletePeriod: undefined,
    } as UserSettings

    render(createElement(PeriodicExecutionRoute))

    const select = screen.getAllByTestId('mock-select-change')[0]
    assert.isDefined(select)
    await user.click(select)
    expect(mocked.handleSelectAutoDelete).toHaveBeenCalledWith('30days')
  })

  it('loading 中は spinner のみを表示する', () => {
    mocked.isLoading = true

    render(createElement(PeriodicExecutionRoute))

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('自動削除期間の変更と確認操作を処理する', async () => {
    const user = userEvent.setup()
    render(createElement(PeriodicExecutionRoute))

    const select = screen.getAllByTestId('mock-select-change')[0]
    assert.isDefined(select)
    await user.click(select)
    expect(mocked.handleSelectAutoDelete).toHaveBeenCalledWith('30days')

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocked.prepareAutoDeletePeriod).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocked.hideConfirmation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(mocked.confirmationConfirm).toHaveBeenCalledTimes(1)
  })

  it('確認 UI を alertdialog として表示し、キャンセルボタンへ初期フォーカスを移す', async () => {
    const user = userEvent.setup()
    render(createElement(PeriodicExecutionRoute))

    await user.click(screen.getByRole('button', { name: 'Apply' }))

    const dialog = screen.getByRole('alertdialog')
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })

    expect(dialog).toHaveAccessibleName('Auto delete')
    expect(dialog).toHaveAccessibleDescription('確認メッセージ')
    expect(cancelButton).toHaveFocus()
  })

  it('確認ダイアログ表示中はフォーカスがダイアログ内に留まり、Escapeで閉じると適用ボタンへ戻る', async () => {
    const user = userEvent.setup()
    render(createElement(PeriodicExecutionRoute))

    const applyButton = screen.getByRole('button', { name: 'Apply' })
    await user.click(applyButton)

    const dialog = screen.getByRole('alertdialog')
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(dialog).toHaveAccessibleName('Auto delete')
    expect(cancelButton).toHaveFocus()

    await user.tab()
    expect(confirmButton).toHaveFocus()
    await user.tab()
    expect(cancelButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(mocked.hideConfirmation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(applyButton).toHaveFocus()
  })
})

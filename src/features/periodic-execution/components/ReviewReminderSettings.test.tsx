import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'
import type { ReviewReminderSettings as ReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'

import { ReviewReminderSettings } from './ReviewReminderSettings'

const settingsMocks = vi.hoisted(() => ({
  language: 'en',
  read: vi.fn<() => Promise<ReminderSettings>>(),
  save: vi.fn<(settings: ReminderSettings) => Promise<void>>(),
  categories: vi.fn<() => Promise<{ id: string; name: string }[]>>(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages(
        settingsMocks.language === 'ja' ? 'ja' : 'en',
      )
      return messages[key] ?? key
    },
  }),
}))
vi.mock('@/lib/storage/review-reminders', () => ({
  readReviewReminderSettings: settingsMocks.read,
  saveReviewReminderSettings: settingsMocks.save,
}))
vi.mock('@/app/composition/reviewReminders', () => ({
  getReviewCategories: settingsMocks.categories,
}))
vi.mock('@/lib/browser/runtime', () => ({
  getExtensionUrl: () => 'chrome-extension://tabbin/app.html',
}))

let persisted: ReminderSettings

beforeEach(() => {
  vi.clearAllMocks()
  settingsMocks.language = 'en'
  persisted = { ...defaultReviewReminderSettings }
  settingsMocks.read.mockImplementation(async () => ({ ...persisted }))
  settingsMocks.categories.mockResolvedValue([
    { id: 'custom-work', name: 'Work' },
    { id: 'domain-reading', name: 'Reading' },
  ])
  settingsMocks.save.mockImplementation(async (settings) => {
    persisted = { ...settings }
  })
})

afterEach(cleanup)

const waitForSettings = async () =>
  screen.findByRole('checkbox', { name: 'Enable review reminders' })

describe('ReviewReminderSettings', () => {
  it.each([
    { target: 'all', invalidDays: '' },
    { target: 'uncategorized', invalidDays: '0' },
    { target: 'category', invalidDays: '1.5' },
  ])(
    'invalid hidden age does not block saving $target',
    async ({ target, invalidDays }) => {
      persisted = {
        ...persisted,
        enabled: true,
        target: 'older',
        olderThanDays: 21,
      }
      const user = userEvent.setup()
      render(<ReviewReminderSettings />)
      await waitForSettings()
      const days = screen.getByRole('spinbutton', {
        name: 'Days since first save',
      })
      await user.clear(days)
      if (invalidDays) {
        await user.type(days, invalidDays)
      }
      await user.selectOptions(screen.getByLabelText('Tabs to review'), target)
      if (target === 'category') {
        await user.selectOptions(
          screen.getByLabelText('Category'),
          'custom-work',
        )
      }
      expect(
        screen.queryByRole('spinbutton', { name: 'Days since first save' }),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole('button', { name: 'Save reminder settings' }),
      )
      expect(settingsMocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ target, olderThanDays: 21 }),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Tabs to review'), 'older')
      expect(
        screen.getByRole('spinbutton', { name: 'Days since first save' }),
      ).toHaveValue(21)
    },
  )

  it('invalid unused age does not block disabling notifications', async () => {
    persisted = {
      ...persisted,
      enabled: true,
      target: 'older',
      olderThanDays: 21,
    }
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await waitForSettings()
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Days since first save' }),
    )
    await user.click(screen.getByLabelText('Enable review reminders'))
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(settingsMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, olderThanDays: 21 }),
    )
  })

  it('normalization preserves valid edits and uses the latest successful save for later invalid drafts', async () => {
    persisted = {
      ...persisted,
      enabled: true,
      target: 'older',
      olderThanDays: 21,
    }
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await waitForSettings()
    const days = screen.getByRole('spinbutton', {
      name: 'Days since first save',
    })
    await user.clear(days)
    await user.type(days, '45')
    await user.selectOptions(screen.getByLabelText('Tabs to review'), 'all')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(persisted.olderThanDays).toBe(45)
    await user.selectOptions(screen.getByLabelText('Tabs to review'), 'older')
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Days since first save' }),
    )
    await user.selectOptions(screen.getByLabelText('Tabs to review'), 'all')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(persisted.olderThanDays).toBe(45)
    expect(settingsMocks.save).toHaveBeenCalledTimes(2)
  })

  it('初期設定は無効で、利用者が有効にするまで通知しない', async () => {
    render(<ReviewReminderSettings />)

    expect(await waitForSettings()).not.toBeChecked()
    expect(screen.getByRole('link', { name: 'Review now' })).toHaveAttribute(
      'href',
      'chrome-extension://tabbin/app.html#/saved-tabs?review=1',
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()
    expect(
      screen.getByText(/they never delete tabs automatically/),
    ).toBeVisible()
    expect(
      screen.getByText(/reminders cannot select unread tabs/),
    ).toBeVisible()
  })

  it('対象・カテゴリ・週次予定・静穏時間を明示的に保存し、再表示に反映する', async () => {
    const user = userEvent.setup()
    const view = render(<ReviewReminderSettings />)
    await user.click(await waitForSettings())
    await user.selectOptions(
      screen.getByLabelText('Tabs to review'),
      'category',
    )
    await user.selectOptions(screen.getByLabelText('Category'), 'custom-work')
    await user.selectOptions(screen.getByLabelText('Day of the week'), '1')
    await user.selectOptions(screen.getByLabelText('Reminder hour'), '15')
    await user.selectOptions(screen.getByLabelText('Quiet hours start'), '23')
    await user.selectOptions(screen.getByLabelText('Quiet hours end'), '7')

    expect(settingsMocks.save).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'unsaved reminder changes',
    )
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Reminder settings saved.',
    )
    expect(persisted).toStrictEqual({
      ...defaultReviewReminderSettings,
      enabled: true,
      target: 'category',
      categoryId: 'custom-work',
      weekday: 1,
      hour: 15,
      quietStartHour: 23,
      quietEndHour: 7,
    })
    view.unmount()
    render(<ReviewReminderSettings />)
    expect(await waitForSettings()).toBeChecked()
    expect(screen.getByLabelText('Category')).toHaveValue('custom-work')
    expect(screen.getByLabelText('Reminder hour')).toHaveValue('15')
  })

  it('有効な設定を無効にして保存し、日次予定と静穏時間の無効化も反映する', async () => {
    persisted.enabled = true
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await user.click(await waitForSettings())
    await user.selectOptions(screen.getByLabelText('Frequency'), 'daily')
    expect(screen.queryByLabelText('Day of the week')).not.toBeInTheDocument()
    await user.click(
      screen.getByLabelText('Pause notifications during quiet hours'),
    )
    expect(screen.queryByLabelText('Quiet hours start')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )

    expect(persisted.enabled).toBe(false)
    expect(persisted.frequency).toBe('daily')
    expect(persisted.quietHoursEnabled).toBe(false)
  })

  it('カテゴリ未選択を拒否し、日数の空欄・小数・0を保存せず修正後は保存する', async () => {
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await user.click(await waitForSettings())
    await user.selectOptions(
      screen.getByLabelText('Tabs to review'),
      'category',
    )
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check the category',
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('Tabs to review'), 'older')
    const days = screen.getByRole('spinbutton', {
      name: 'Days since first save',
    })
    await user.clear(days)
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()
    await user.type(days, '1.5')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()
    await user.clear(days)
    await user.type(days, '0')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()
    await user.clear(days)
    await user.type(days, '45')
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(persisted.olderThanDays).toBe(45)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('読み込み失敗では既定値で上書きする保存を許可しない', async () => {
    settingsMocks.read.mockRejectedValue(new Error('storage unavailable'))
    render(<ReviewReminderSettings />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be loaded',
    )
    expect(
      screen.queryByRole('button', { name: 'Save reminder settings' }),
    ).not.toBeInTheDocument()
    expect(settingsMocks.save).not.toHaveBeenCalled()
  })

  it('保存失敗でも編集内容を残し、再保存できる', async () => {
    settingsMocks.save.mockRejectedValueOnce(new Error('write failed'))
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await user.click(await waitForSettings())
    await user.selectOptions(
      screen.getByLabelText('Tabs to review'),
      'uncategorized',
    )
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'try saving again',
    )
    expect(screen.getByLabelText('Tabs to review')).toHaveValue('uncategorized')
    expect(persisted.enabled).toBe(false)
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(persisted.enabled).toBe(true)
    expect(persisted.target).toBe('uncategorized')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('連続 submit を1回の保存にまとめ、保存中はフォームを編集できない', async () => {
    let finishSave: (() => void) | undefined
    settingsMocks.save.mockImplementation(
      async () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    render(<ReviewReminderSettings />)
    await waitForSettings()
    const form = screen.getByRole('form', { name: 'Review reminders' })
    act(() => {
      // eslint-disable-next-line testing-library/prefer-user-event -- exercise same-turn native submissions
      fireEvent.submit(form)
      // eslint-disable-next-line testing-library/prefer-user-event -- exercise same-turn native submissions
      fireEvent.submit(form)
    })
    expect(settingsMocks.save).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Saving reminder settings…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Tabs to review')).toBeDisabled()
    await act(async () => {
      finishSave?.()
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reminder settings saved.',
    )
  })

  it('カテゴリ読込失敗を示し、カテゴリを使わない設定は保存できる', async () => {
    settingsMocks.categories.mockRejectedValue(
      new Error('database unavailable'),
    )
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await user.click(await waitForSettings())
    expect(screen.getByText(/Categories could not be loaded/)).toBeVisible()
    await user.selectOptions(
      screen.getByLabelText('Tabs to review'),
      'uncategorized',
    )
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(persisted.target).toBe('uncategorized')
  })

  it('削除されたカテゴリは利用不可と示し、無効化の保存はできる', async () => {
    persisted = {
      ...persisted,
      enabled: true,
      target: 'category',
      categoryId: 'deleted',
    }
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await waitForSettings()
    expect(
      screen.getByRole('option', {
        name: 'Previously selected category is unavailable',
      }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(settingsMocks.save).not.toHaveBeenCalled()
    await user.click(screen.getByLabelText('Enable review reminders'))
    await user.click(
      screen.getByRole('button', { name: 'Save reminder settings' }),
    )
    expect(persisted.enabled).toBe(false)
  })

  it('同じ開始・終了時刻を静穏時間なしとして保存でき、日本語ラベルも表示する', async () => {
    settingsMocks.language = 'ja'
    const user = userEvent.setup()
    render(<ReviewReminderSettings />)
    await screen.findByRole('checkbox', {
      name: '整理リマインダーを有効にする',
    })
    expect(
      screen.getByRole('heading', { name: '整理リマインダー' }),
    ).toBeVisible()
    await user.selectOptions(screen.getByLabelText('静穏時間の終了'), '22')
    await user.click(
      screen.getByRole('button', { name: 'リマインダー設定を保存' }),
    )
    expect(persisted.quietEndHour).toBe(persisted.quietStartHour)
    expect(screen.getByRole('status')).toHaveTextContent(
      'リマインダー設定を保存しました。',
    )
  })
})

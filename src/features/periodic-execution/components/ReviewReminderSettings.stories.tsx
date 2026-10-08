import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from 'storybook/test'

import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { ReviewReminderSettings } from './ReviewReminderSettings'

const meta = {
  component: ReviewReminderSettings,
  render: () => (
    <I18nProvider>
      <ReviewReminderSettings />
    </I18nProvider>
  ),
  title: 'Features/PeriodicExecution/ReviewReminderSettings',
} satisfies Meta<typeof ReviewReminderSettings>

type Story = StoryObj<typeof meta>

export const DisabledByDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('checkbox', {
        name: /Enable review reminders|整理リマインダーを有効にする/,
      }),
    ).not.toBeChecked()
  },
}

export const DailyReminderDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('checkbox', {
        name: /Enable review reminders|整理リマインダーを有効にする/,
      }),
    )
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: /Frequency|通知の頻度/ }),
      'daily',
    )
    await expect(canvas.getByRole('status')).toHaveTextContent(
      /unsaved reminder changes|未保存のリマインダー設定/,
    )
  },
}

export default meta

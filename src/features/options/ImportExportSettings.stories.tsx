import type { Meta, StoryObj } from '@storybook/react'
import { userEvent, within } from 'storybook/test'

import { ImportExportSettings } from './ImportExportSettings'

const meta = {
  component: ImportExportSettings,
  title: 'Features/Options/ImportExportSettings',
} satisfies Meta<typeof ImportExportSettings>

type Story = StoryObj<typeof ImportExportSettings>

export const Idle: Story = {}

export const OpenedImportDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: /設定とタブデータをインポート/i,
      }),
    )
  },
}

export default meta

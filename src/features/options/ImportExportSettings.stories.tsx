import type { Meta, StoryObj } from '@storybook/react'
import { userEvent, within } from 'storybook/test'

import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { ImportExportSettings } from './ImportExportSettings'
import { RecoverySnapshotNotice } from './RecoverySnapshotNotice'

const meta = {
  component: ImportExportSettings,
  render: () => (
    <I18nProvider>
      <ImportExportSettings />
    </I18nProvider>
  ),
  title: 'Features/Options/ImportExportSettings',
} satisfies Meta<typeof ImportExportSettings>

type Story = StoryObj<typeof ImportExportSettings>

const restoreRecoveryPoint = async (): Promise<void> => {
  await Promise.resolve()
}

export const Idle: Story = {}

export const RecoveryPoint: Story = {
  render: () => (
    <I18nProvider>
      <RecoverySnapshotNotice
        isRestoring={false}
        onRestore={restoreRecoveryPoint}
        snapshot={{
          createdAt: Date.UTC(2026, 6, 29, 14),
          expiresAt: Date.UTC(2026, 7, 5, 14),
          id: '00000000-0000-4000-8000-000000000740',
          serializedBytes: 1_024,
          sourceRevision: 12,
        }}
      />
    </I18nProvider>
  ),
}

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

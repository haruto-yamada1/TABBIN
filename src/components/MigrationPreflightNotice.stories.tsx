// @covers app/composition/MigrationPreflightNotice.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { MigrationPreflightNotice } from '@/app/composition/MigrationPreflightNotice'
import type { MigrationPreflightNoticeController } from '@/app/composition/MigrationPreflightNotice'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'

const completeImmediately = async (): Promise<void> => {
  await Promise.resolve()
}

const blockedController: MigrationPreflightNoticeController = {
  backupCurrentData: completeImmediately,
  copyDiagnostic: completeImmediately,
  readStatus: () => ({
    issueCodes: ['URL_IDENTITY_COLLISION'],
    status: 'blocked',
  }),
  run: completeImmediately,
}

export default {
  component: MigrationPreflightNotice,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <I18nProvider>
      <MigrationPreflightNotice controller={blockedController} />
    </I18nProvider>
  ),
  title: 'Components/MigrationPreflightNotice',
} satisfies Meta<typeof MigrationPreflightNotice>

type Story = StoryObj<typeof MigrationPreflightNotice>

export const Blocked: Story = {}

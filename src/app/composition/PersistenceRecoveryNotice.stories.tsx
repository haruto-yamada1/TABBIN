// @covers app/composition/PersistenceRecoveryNotice.tsx
import type { Meta, StoryObj } from '@storybook/react'

import type {
  PersistenceRecoveryControllerPort,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { PersistenceRecoveryNotice } from './PersistenceRecoveryNotice'

const recoveryState = {
  errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
  status: 'unavailable',
} satisfies PersistenceRecoveryState

const recovery = {
  clear: () => undefined,
  getSnapshot: () => recoveryState,
  reportUnavailable: () => undefined,
  retry: async () => undefined,
  subscribe: () => () => undefined,
} satisfies PersistenceRecoveryControllerPort

export default {
  component: PersistenceRecoveryNotice,
  render: () => (
    <I18nProvider>
      <PersistenceRecoveryNotice recovery={recovery} />
    </I18nProvider>
  ),
  title: 'App/PersistenceRecoveryNotice',
} satisfies Meta<typeof PersistenceRecoveryNotice>

type Story = StoryObj<typeof PersistenceRecoveryNotice>

export const DatabaseFailure: Story = {}

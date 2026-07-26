// @covers app/composition/PersistenceRecoveryNotice.tsx
import type { Meta, StoryObj } from '@storybook/react'

import type {
  PersistenceRecoveryControllerPort,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { PersistenceRecoveryNotice } from './PersistenceRecoveryNotice'

const recoveryState = {
  diagnostic: {
    errorCode: 'MIGRATION_SOURCE_BLOCKED',
    issueCodes: ['LEGACY_URL_REFERENCE_CONFLICT'],
    migrationId: 'migration-preview',
    sourceBytes: 24_576,
    sourceEntityCounts: {
      collections: 12,
      memberships: 248,
      urls: 231,
    },
    stage: 'source-map',
  },
  errorCode: 'PERSISTENCE_MIGRATION_FAILED',
  status: 'unavailable',
} satisfies PersistenceRecoveryState

const recovery = {
  clear: () => undefined,
  createEmergencyBackup: async () => {
    throw new Error('Story action is not connected')
  },
  getSnapshot: () => recoveryState,
  reportUnavailable: () => undefined,
  rerunPreflightAndRetry: async () => undefined,
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

export const MigrationFailure: Story = {}

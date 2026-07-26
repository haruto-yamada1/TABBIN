// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { PersistenceCapacityRecovery } from './PersistenceCapacityRecovery'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'options.persistenceRecovery.backup': 'Back up current data',
        'options.persistenceRecovery.description':
          'The update could not be completed. Your previous data has not been deleted.',
        'options.persistenceRecovery.diskWriteFailed':
          'Writing data to browser storage failed.',
        'options.persistenceRecovery.preflightFailed':
          'Available browser storage could not be confirmed.',
        'options.persistenceRecovery.quotaExceeded':
          'There is not enough browser storage to complete the update.',
        'options.persistenceRecovery.retry': 'Retry',
        'options.persistenceRecovery.storageUnavailable':
          'Browser storage is currently unavailable.',
        'options.persistenceRecovery.title': 'Storage recovery required',
      }
      return messages[key] ?? key
    },
  }),
}))

describe('PersistenceCapacityRecovery', () => {
  afterEach(cleanup)

  it.each([
    [
      'PERSISTENCE_QUOTA_EXCEEDED',
      'There is not enough browser storage to complete the update.',
    ],
    [
      'PERSISTENCE_DISK_WRITE_FAILED',
      'Writing data to browser storage failed.',
    ],
    [
      'PERSISTENCE_STORAGE_UNAVAILABLE',
      'Browser storage is currently unavailable.',
    ],
    [
      'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      'Available browser storage could not be confirmed.',
    ],
  ] as const)('renders a safe recovery reason for %s', (errorCode, reason) => {
    render(
      <PersistenceCapacityRecovery
        errorCode={errorCode}
        onBackup={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(reason)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your previous data has not been deleted.',
    )
    expect(screen.queryByText('/private/profile/path')).toBeNull()
  })

  it('offers backup and retry actions', async () => {
    const user = userEvent.setup()
    const onBackup = vi.fn()
    const onRetry = vi.fn()

    render(
      <PersistenceCapacityRecovery
        errorCode='PERSISTENCE_QUOTA_EXCEEDED'
        onBackup={onBackup}
        onRetry={onRetry}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Back up current data' }),
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onBackup).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

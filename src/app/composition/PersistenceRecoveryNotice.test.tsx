import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  PersistenceBootstrapErrorCode,
  PersistenceRecoveryControllerPort,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import { deserializePersistenceEmergencyBackup } from '@/contexts/saved-tabs/application/services/PersistenceEmergencyBackupCodecService'

import { PersistenceRecoveryNotice } from './PersistenceRecoveryNotice'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? '',
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const rawLegacyStorage = Object.fromEntries(
  MIGRATION_SOURCE_KEYS.map((key) => [key, { status: 'missing' }]),
) as RawLegacyStorageSnapshot

class FakeRecoveryController implements PersistenceRecoveryControllerPort {
  private readonly listeners = new Set<() => void>()
  private state: PersistenceRecoveryState

  constructor(state: PersistenceRecoveryState) {
    this.state = state
  }

  readonly clear = (): void => {
    this.state = { status: 'available' }
    this.emit()
  }

  readonly createEmergencyBackup = vi.fn(async () => ({
    createdAt: 123,
    format: 'tabbin-legacy-emergency-backup' as const,
    rawLegacyStorage,
    version: 1 as const,
    warning: 'contains-private-user-data' as const,
  }))

  readonly getSnapshot = (): PersistenceRecoveryState => this.state

  readonly reportUnavailable = (
    errorCode: PersistenceBootstrapErrorCode,
  ): void => {
    this.state = { status: 'unavailable', errorCode }
    this.emit()
  }

  readonly retry = vi.fn(async (): Promise<void> => {
    this.clear()
  })

  readonly rerunPreflightAndRetry = vi.fn(async (): Promise<void> => {
    this.clear()
  })

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private readonly emit = (): void => {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

describe('PersistenceRecoveryNotice', () => {
  it('does not render while persistence is available', () => {
    render(
      <PersistenceRecoveryNotice
        recovery={new FakeRecoveryController({ status: 'available' })}
      />,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows preserved-data guidance and provides a working retry action', async () => {
    const user = userEvent.setup()
    const recovery = new FakeRecoveryController({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
    })
    render(<PersistenceRecoveryNotice recovery={recovery} />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(
      screen.getByText(/Your previous data has not been deleted/),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(recovery.retry).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('downloads an explicitly private raw backup and exposes only safe diagnostic fields', async () => {
    const user = userEvent.setup()
    const recovery = new FakeRecoveryController({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      diagnostic: {
        errorCode: 'MIGRATION_SOURCE_BLOCKED',
        issueCodes: ['LEGACY_URL_REFERENCE_CONFLICT'],
        migrationId: 'migration-1',
        sourceBytes: 1234,
        sourceEntityCounts: { urls: 2 },
        stage: 'source-map',
      },
    })
    recovery.createEmergencyBackup.mockResolvedValue({
      createdAt: 123,
      format: 'tabbin-legacy-emergency-backup',
      rawLegacyStorage: {
        ...rawLegacyStorage,
        urls: { status: 'present', value: undefined },
      },
      version: 1,
      warning: 'contains-private-user-data',
    })
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:backup')
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    render(<PersistenceRecoveryNotice recovery={recovery} />)

    expect(
      screen.getByText(/contains private URLs, titles, notes, and AI content/i),
    ).toBeTruthy()
    expect(screen.getByText(/MIGRATION_SOURCE_BLOCKED/)).toBeTruthy()
    expect(screen.queryByText(/private\.example/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
    await expect(navigator.clipboard.readText()).resolves.toContain(
      'MIGRATION_SOURCE_BLOCKED',
    )

    await user.click(
      screen.getByRole('button', { name: 'Back up current data' }),
    )

    await waitFor(() =>
      expect(recovery.createEmergencyBackup).toHaveBeenCalledTimes(1),
    )
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    const blob = createObjectUrl.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    const restored = deserializePersistenceEmergencyBackup(
      await (blob as Blob).text(),
    )
    expect(restored.rawLegacyStorage.urls).toEqual({
      status: 'present',
      value: undefined,
    })
    expect(Object.hasOwn(restored.rawLegacyStorage.urls, 'value')).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:backup')
  })

  it.each([
    {
      action: 'Back up current data',
      reject: (recovery: FakeRecoveryController) => {
        recovery.createEmergencyBackup.mockRejectedValue(
          new Error('private backup failure'),
        )
      },
    },
    {
      action: 'Copy diagnostics',
      reject: () => {
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
          new Error('private clipboard failure'),
        )
      },
    },
  ])(
    'shows a raw-free local error when $action fails',
    async ({ action, reject }) => {
      const user = userEvent.setup()
      const recovery = new FakeRecoveryController({
        status: 'unavailable',
        errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      })
      reject(recovery)
      render(<PersistenceRecoveryNotice recovery={recovery} />)

      await user.click(screen.getByRole('button', { name: action }))

      await waitFor(() =>
        expect(
          screen.getByText('The action could not be completed. Try again.'),
        ).toBeTruthy(),
      )
      expect(screen.queryByText(/private .* failure/)).toBeNull()
      expect(screen.getByRole('button', { name: action })).not.toBeDisabled()
    },
  )

  it('reruns preflight before retrying the failed migration', async () => {
    const user = userEvent.setup()
    const recovery = new FakeRecoveryController({
      status: 'unavailable',
      errorCode: 'PERSISTENCE_PREFLIGHT_STALE',
    })
    render(<PersistenceRecoveryNotice recovery={recovery} />)

    await user.click(
      screen.getByRole('button', { name: 'Run checks and retry' }),
    )

    await waitFor(() =>
      expect(recovery.rerunPreflightAndRetry).toHaveBeenCalledTimes(1),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

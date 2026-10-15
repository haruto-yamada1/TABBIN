import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  PersistenceBootstrapErrorCode,
  PersistenceRecoveryControllerPort,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { PersistenceRecoveryNotice } from './PersistenceRecoveryNotice'

const { exportSavedTabsRecoveryData } = vi.hoisted(() => ({
  exportSavedTabsRecoveryData: vi.fn(async () => undefined),
}))
vi.mock('./persistenceRecoveryExport', () => ({ exportSavedTabsRecoveryData }))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? '',
  }),
}))
vi.mock('./createPersistenceRecoveryController', () => {
  const state = { status: 'available' }
  return {
    getPersistenceRecoveryController: () => ({
      getSnapshot: () => state,
      subscribe: () => () => undefined,
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  exportSavedTabsRecoveryData.mockReset()
})

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

const unavailable = (): FakeRecoveryController =>
  new FakeRecoveryController({
    status: 'unavailable',
    errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
  })

describe('PersistenceRecoveryNotice', () => {
  it('does not render while persistence is available', () => {
    render(
      <PersistenceRecoveryNotice
        recovery={new FakeRecoveryController({ status: 'available' })}
      />,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uses the production recovery controller by default', () => {
    render(<PersistenceRecoveryNotice />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('explains the database failure and provides recovery export, retry and error-code copy', async () => {
    const user = userEvent.setup()
    const recovery = unavailable()
    render(<PersistenceRecoveryNotice recovery={recovery} />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(
      screen.getByText(
        'Saved data could not be read. Existing data has not been deleted.',
      ),
    ).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(
      screen.queryByRole('button', { name: 'Back up current data' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Run checks and retry' }),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(recovery.retry).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('exports only on request and keeps private export failures out of the notice', async () => {
    const user = userEvent.setup()
    exportSavedTabsRecoveryData.mockRejectedValueOnce(
      new Error('private URL and record'),
    )
    render(<PersistenceRecoveryNotice recovery={unavailable()} />)
    expect(exportSavedTabsRecoveryData).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Export saved-tab recovery data' }),
    )
    await waitFor(() =>
      expect(exportSavedTabsRecoveryData).toHaveBeenCalledOnce(),
    )
    expect(screen.getByRole('alert')).toBeVisible()
    expect(
      screen.getByText('The action could not be completed. Try again.'),
    ).toBeVisible()
    expect(screen.queryByText(/private URL/)).toBeNull()
  })

  it('copies only the safe error code', async () => {
    const user = userEvent.setup()
    render(<PersistenceRecoveryNotice recovery={unavailable()} />)

    await user.click(screen.getByRole('button', { name: 'Copy error code' }))

    await expect(navigator.clipboard.readText()).resolves.toBe(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
  })

  it('shows a local copy failure without displaying private exception text', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('private clipboard failure'),
    )
    render(<PersistenceRecoveryNotice recovery={unavailable()} />)

    await user.click(screen.getByRole('button', { name: 'Copy error code' }))

    await waitFor(() =>
      expect(
        screen.getByText('The action could not be completed. Try again.'),
      ).toBeTruthy(),
    )
    expect(screen.queryByText(/private clipboard failure/)).toBeNull()
  })

  it('prevents duplicate retries and retains the notice when the database retry fails', async () => {
    const user = userEvent.setup()
    const recovery = unavailable()
    let rejectRetry: ((error: Error) => void) | undefined
    recovery.retry.mockImplementationOnce(
      async () =>
        new Promise<void>((_resolve, reject) => {
          rejectRetry = reject
        }),
    )
    render(<PersistenceRecoveryNotice recovery={recovery} />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
    rejectRetry?.(new Error('private database failure'))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' })).not.toBeDisabled(),
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/private database failure/)).toBeNull()
    expect(recovery.retry).toHaveBeenCalledOnce()
  })
})

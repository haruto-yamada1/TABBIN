import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  PersistenceBootstrapErrorCode,
  PersistenceRecoveryControllerPort,
  PersistenceRecoveryState,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import { PersistenceRecoveryNotice } from './PersistenceRecoveryNotice'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? '',
  }),
}))

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
})

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MigrationPreflightNotice } from './MigrationPreflightNotice'
import type {
  MigrationPreflightNoticeController,
  MigrationPreflightNoticeState,
} from './MigrationPreflightNotice'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? '',
  }),
}))

afterEach(() => {
  cleanup()
})

class FakeMigrationPreflightController implements MigrationPreflightNoticeController {
  private readonly nextState: MigrationPreflightNoticeState
  private state: MigrationPreflightNoticeState

  constructor(
    state: MigrationPreflightNoticeState,
    nextState: MigrationPreflightNoticeState = state,
  ) {
    this.state = state
    this.nextState = nextState
  }

  readonly backupCurrentData = vi.fn(async (): Promise<void> => {})

  readonly copyDiagnostic = vi.fn(async (): Promise<void> => {})

  readonly readStatus = (): MigrationPreflightNoticeState => this.state

  readonly run = vi.fn(async (): Promise<void> => {
    this.state = this.nextState
  })
}

const visibleStates: readonly MigrationPreflightNoticeState[] = [
  { status: 'stale' },
  {
    status: 'blocked',
    issueCodes: ['MIGRATION_SOURCE_READ_FAILED'],
  },
]

describe('MigrationPreflightNotice', () => {
  it('runs a not-run preflight on mount and shows its blocked result', async () => {
    const controller = new FakeMigrationPreflightController(
      { status: 'not-run' },
      {
        status: 'blocked',
        issueCodes: ['MIGRATION_SOURCE_READ_FAILED'],
      },
    )

    render(<MigrationPreflightNotice controller={controller} />)

    await waitFor(() => expect(controller.run).toHaveBeenCalledOnce())
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('does not render or rerun a healthy preflight', () => {
    const controller = new FakeMigrationPreflightController({
      status: 'healthy',
    })

    render(<MigrationPreflightNotice controller={controller} />)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(controller.run).not.toHaveBeenCalled()
  })

  it.each(visibleStates)(
    'shows preserved-data guidance and recovery actions for $status',
    (state) => {
      render(
        <MigrationPreflightNotice
          controller={new FakeMigrationPreflightController(state)}
        />,
      )

      expect(screen.getByRole('alert')).toBeTruthy()
      expect(
        screen.getByText('現在のデータは変更されていません。'),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: '診断情報をコピー' }),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: '現在のデータをバックアップ' }),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
      expect(screen.queryByText('MIGRATION_SOURCE_READ_FAILED')).toBeNull()
    },
  )

  it('delegates copy, backup, and retry actions to the controller', async () => {
    const user = userEvent.setup()
    const controller = new FakeMigrationPreflightController(
      {
        status: 'blocked',
        issueCodes: ['MIGRATION_SOURCE_READ_FAILED'],
      },
      { status: 'healthy' },
    )
    render(<MigrationPreflightNotice controller={controller} />)

    await user.click(screen.getByRole('button', { name: '診断情報をコピー' }))
    await user.click(
      screen.getByRole('button', { name: '現在のデータをバックアップ' }),
    )
    await user.click(screen.getByRole('button', { name: '再試行' }))

    await waitFor(() =>
      expect(controller.copyDiagnostic).toHaveBeenCalledOnce(),
    )
    await waitFor(() =>
      expect(controller.backupCurrentData).toHaveBeenCalledOnce(),
    )
    await waitFor(() => expect(controller.run).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

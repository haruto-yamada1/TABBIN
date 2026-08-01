// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PersistenceMigrationNotice } from './PersistenceMigrationNotice'
import type { PersistenceMigrationNoticeControllerPort } from './persistenceMigrationNoticeController'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
    t: (key: string) =>
      ({
        'persistenceMigrationNotice.dismiss': 'Dismiss migration notice',
        'persistenceMigrationNotice.importExportLink': 'Open Import / Export',
        'persistenceMigrationNotice.message':
          'Import required backups by August 31, 2026, then export them again in the new format.',
        'persistenceMigrationNotice.title': 'Data storage was updated',
        'persistenceMigrationNotice.warning':
          'Backups created with older versions can no longer be imported on or after September 1, 2026.',
      })[key] ?? key,
  }),
}))

const createController = (
  shouldShow: boolean,
): PersistenceMigrationNoticeControllerPort => ({
  dismiss: vi.fn(async () => {}),
  shouldShow: vi.fn(async () => shouldShow),
})

describe('PersistenceMigrationNotice', () => {
  it('shows an accessible warning and dismisses it immediately after persistence', async () => {
    const user = userEvent.setup()
    let resolveDismiss: (() => void) | undefined
    const controller = {
      ...createController(true),
      dismiss: vi.fn(
        async () =>
          new Promise<void>((resolve) => {
            resolveDismiss = resolve
          }),
      ),
    }

    render(<PersistenceMigrationNotice controller={controller} />)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Backups created with older versions can no longer be imported on or after September 1, 2026.',
    )
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBeNull()
    expect(
      screen
        .getByRole('link', { name: 'Open Import / Export' })
        .getAttribute('href'),
    ).toBe('#/options')

    await user.click(
      screen.getByRole('button', { name: 'Dismiss migration notice' }),
    )

    expect(controller.dismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => {
      resolveDismiss?.()
      await Promise.resolve()
    })
  })

  it('keeps the notice hidden when dismissal persistence fails', async () => {
    const user = userEvent.setup()
    const controller = {
      ...createController(true),
      dismiss: vi.fn(async () => {
        throw new Error('storage unavailable')
      }),
    }

    render(<PersistenceMigrationNotice controller={controller} />)

    await screen.findByRole('alert')
    await user.click(
      screen.getByRole('button', { name: 'Dismiss migration notice' }),
    )

    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => {
      expect(controller.dismiss).toHaveBeenCalledOnce()
    })
  })

  it('does not render before a completed migration is eligible for notice display', async () => {
    render(<PersistenceMigrationNotice controller={createController(false)} />)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})

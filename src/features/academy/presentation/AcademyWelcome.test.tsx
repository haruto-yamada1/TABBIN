// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AcademyWelcome } from './AcademyWelcome'

const text = { 'common.close': 'Close' }
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
    t: (key: string) => text[key as keyof typeof text] ?? key,
  }),
}))
const CurrentLocation = () => (
  <span data-testid='current-path'>{useLocation().pathname}</span>
)
const setup = (claim = vi.fn(async () => true)) => {
  const useCases = {
    prepareInstall: vi.fn(async () => {}),
    claim,
    dismiss: vi.fn(async (_action: 'dismiss' | 'skip') => {}),
  }
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/saved-tabs']}>
        <CurrentLocation />
        <AcademyWelcome useCases={useCases} />
      </MemoryRouter>
    </StrictMode>,
  )
  return { useCases, view, user: userEvent.setup() }
}

afterEach(cleanup)

describe('Academy first-install welcome', () => {
  it('does not show a guide before readiness and a persisted claim resolve', async () => {
    const pending = Promise.withResolvers<boolean>()
    const { useCases } = setup(vi.fn(async () => pending.promise))
    expect(screen.queryByRole('dialog')).toBeNull()
    pending.resolve(true)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(useCases.claim).toHaveBeenCalledOnce()
  })

  it('navigates to Academy after recording the user choice', async () => {
    const { useCases, user } = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Start the guide' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('current-path').textContent).toBe('/academy'),
    )
    expect(useCases.dismiss).toHaveBeenCalledWith('dismiss')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['Later', 'Skip', 'Close'])(
    'dismisses via %s without starting a lesson or navigating',
    async (name) => {
      const { useCases, user } = setup()
      await user.click(await screen.findByRole('button', { name }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(useCases.dismiss).toHaveBeenCalledWith(
        name === 'Skip' ? 'skip' : 'dismiss',
      )
      expect(screen.getByTestId('current-path').textContent).toBe('/saved-tabs')
    },
  )

  it('persists an Escape dismissal', async () => {
    const { useCases, user } = setup()
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useCases.dismiss).toHaveBeenCalledWith('dismiss')
  })

  it('keeps navigation usable when no install claim exists or retrieval fails', async () => {
    const { view } = setup(vi.fn(async () => false))
    await waitFor(() =>
      expect(screen.getByTestId('current-path').textContent).toBe(
        '/saved-tabs',
      ),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    setup(
      vi.fn(async () => {
        throw new Error('private storage detail')
      }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('current-path').textContent).toBe(
        '/saved-tabs',
      ),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('private storage detail')).toBeNull()
  })

  it.each(['Later', 'Skip', 'Close', 'Start the guide'])(
    'never traps the user when %s cannot persist an intro choice',
    async (name) => {
      const { useCases, user } = setup()
      useCases.dismiss.mockRejectedValue(new Error('private storage detail'))
      await user.click(await screen.findByRole('button', { name }))
      expect(await screen.findByRole('alert')).toBeTruthy()
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(screen.queryByText('private storage detail')).toBeNull()
      expect(screen.getByTestId('current-path').textContent).toBe(
        name === 'Start the guide' ? '/academy' : '/saved-tabs',
      )
    },
  )
})

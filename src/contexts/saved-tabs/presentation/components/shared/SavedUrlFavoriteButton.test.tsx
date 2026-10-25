// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import type { SetSavedUrlFavoriteUseCase } from '@/contexts/saved-tabs/application/use-cases/SetSavedUrlFavoriteUseCase'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

import { SavedUrlFavoriteButton } from './SavedUrlFavoriteButton'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessage } = await import('@/features/i18n/lib/language')
  return {
    useI18n: () => ({
      t: (key: string, fallback?: string, values?: Record<string, string>) =>
        getMessage('en', key, fallback, values),
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const renderButton = (
  setSavedUrlFavorite: SetSavedUrlFavoriteUseCase,
  isFavorite = false,
) =>
  render(
    <SavedTabsUseCasesProvider
      value={{
        deps: createSavedTabsPresentationPortsStub(),
        useCases: createSavedTabsUseCasesStub({ setSavedUrlFavorite }),
      }}
    >
      <SavedUrlFavoriteButton
        url='https://example.com/'
        title='Example'
        isFavorite={isFavorite}
      />
    </SavedTabsUseCasesProvider>,
  )

describe('SavedUrlFavoriteButton', () => {
  it('waits for persistence and prevents duplicate keyboard/mouse submissions', async () => {
    let finish = () => {}
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const save = vi.fn(async () => pending)
    renderButton(save)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Favorite: Example' })
    button.focus()
    await user.keyboard('{Enter}')
    expect(save).toHaveBeenCalledWith({
      url: 'https://example.com/',
      isFavorite: true,
    })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toBeDisabled()
    await user.click(button)
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await pending
    })
    expect(button).toBeEnabled()
  })

  it('preserves the persisted state and exposes a retry after failure', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('QuotaExceededError'))
      .mockResolvedValue(undefined)
    renderButton(save, true)
    const button = screen.getByRole('button', { name: 'Favorite: Example' })
    const user = userEvent.setup()
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(toast.error).toHaveBeenCalledWith(
      'Could not save the favorite. Try again.',
    )
    await user.click(button)
    expect(save).toHaveBeenLastCalledWith({
      url: 'https://example.com/',
      isFavorite: false,
    })
  })

  it('is unavailable outside a persistence provider', () => {
    render(
      <SavedUrlFavoriteButton url='https://example.com/' title='Example' />,
    )
    expect(
      screen.getByRole('button', { name: 'Favorite: Example' }),
    ).toBeDisabled()
  })
})

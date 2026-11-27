// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

import { SavedTabsEmptyState } from './SavedTabsEmptyState'

afterEach(cleanup)

describe('SavedTabsEmptyState', () => {
  it('保存ハンドラがあるときタイトル・説明文と 2 つの CTA を表示する', () => {
    render(<SavedTabsEmptyState onSaveAllOpenTabs={vi.fn()} />)

    expect(screen.getByTestId('saved-tabs-empty-state')).toBeInTheDocument()
    expect(screen.getByText('savedTabs.emptyTitle')).toBeInTheDocument()
    expect(screen.getByText('savedTabs.emptyDescription')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /savedTabs\.emptyState\.saveAllOpenTabsCta/,
      }),
    ).toBeInTheDocument()

    const academyLink = screen.getByRole('link', {
      name: /savedTabs\.emptyState\.academyCta/,
    })
    expect(academyLink.getAttribute('href')).toContain('academy')
  })

  it('保存 CTA のクリックでハンドラを 1 回呼び、完了まで保存中表示にする', async () => {
    const user = userEvent.setup()
    let resolveSave: () => void = () => {}
    const onSaveAllOpenTabs = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )
    render(<SavedTabsEmptyState onSaveAllOpenTabs={onSaveAllOpenTabs} />)

    await user.click(
      screen.getByRole('button', {
        name: /savedTabs\.emptyState\.saveAllOpenTabsCta/,
      }),
    )

    expect(onSaveAllOpenTabs).toHaveBeenCalledTimes(1)
    const savingButton = screen.getByRole('button', {
      name: /savedTabs\.emptyState\.saveAllOpenTabsSaving/,
    })
    expect(savingButton).toBeDisabled()

    resolveSave()
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /savedTabs\.emptyState\.saveAllOpenTabsCta/,
        }),
      ).toBeInTheDocument()
    })
  })

  it('保存が失敗したらエラートーストを表示する', async () => {
    const user = userEvent.setup()
    const toastErrorSpy = vi
      .spyOn(toast, 'error')
      .mockReturnValue('error-toast')
    const onSaveAllOpenTabs = vi.fn(async () => {
      throw new Error('boom')
    })
    render(<SavedTabsEmptyState onSaveAllOpenTabs={onSaveAllOpenTabs} />)

    await user.click(
      screen.getByRole('button', {
        name: /savedTabs\.emptyState\.saveAllOpenTabsCta/,
      }),
    )

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith(
        'savedTabs.emptyState.saveAllOpenTabsError',
      )
    })
    toastErrorSpy.mockRestore()
  })

  it('保存ハンドラがないときは CTA を出さず説明文だけを表示する', () => {
    render(<SavedTabsEmptyState />)

    expect(screen.getByText('savedTabs.emptyTitle')).toBeInTheDocument()
    expect(screen.getByText('savedTabs.emptyDescription')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

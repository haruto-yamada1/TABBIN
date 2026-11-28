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

  it('centerInViewport のときは画面全体へ広がり、root はクリック透過で CTA 行だけ操作可能になる', async () => {
    const user = userEvent.setup()
    const onSaveAllOpenTabs = vi.fn(async () => {})
    render(
      <SavedTabsEmptyState
        centerInViewport
        onSaveAllOpenTabs={onSaveAllOpenTabs}
      />,
    )

    const root = screen.getByTestId('saved-tabs-empty-state')
    expect(root).toHaveClass('absolute', 'inset-0', 'pointer-events-none')
    expect(root).not.toHaveClass('flex-1')

    const saveButton = screen.getByRole('button', {
      name: /savedTabs\.emptyState\.saveAllOpenTabsCta/,
    })
    // CTA 行だけ pointer-events を戻し、背後のヘッダー操作と両立させる
    // eslint-disable-next-line testing-library/no-node-access
    expect(saveButton.parentElement).toHaveClass('pointer-events-auto')

    await user.click(saveButton)
    expect(onSaveAllOpenTabs).toHaveBeenCalledTimes(1)
  })

  it('centerInViewport がないときは従来どおり親の高さに広がるレイアウトになる', () => {
    render(<SavedTabsEmptyState onSaveAllOpenTabs={vi.fn()} />)

    const root = screen.getByTestId('saved-tabs-empty-state')
    expect(root).toHaveClass('min-h-[200px]', 'flex-1')
    expect(root).not.toHaveClass('absolute', 'pointer-events-none')
  })

  it('保存ハンドラがないときは CTA を出さず説明文だけを表示する', () => {
    render(<SavedTabsEmptyState />)

    expect(screen.getByText('savedTabs.emptyTitle')).toBeInTheDocument()
    expect(screen.getByText('savedTabs.emptyDescription')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

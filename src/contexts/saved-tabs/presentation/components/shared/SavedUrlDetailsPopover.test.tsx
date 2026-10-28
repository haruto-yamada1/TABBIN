// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SavedUrlDetailsPopover } from './SavedUrlDetailsPopover'

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
  vi.restoreAllMocks()
})

const url = `https://example.com/長いパス/${'segment/'.repeat(100)}?q=%E6%A4%9C%E7%B4%A2&sort=asc#fragment`

const openDetails = async () => {
  const user = userEvent.setup()
  render(<SavedUrlDetailsPopover url={url} title='Example' />)
  await user.click(screen.getByRole('button', { name: 'View URL: Example' }))
  return user
}

describe('SavedUrlDetailsPopover', () => {
  it('copies the exact full URL without normalization or truncation', async () => {
    const user = await openDetails()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue()
    const text = screen.getByRole('textbox', { name: 'Full URL' })
    expect(text).toHaveValue(url)
    expect(text).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(url)
    expect(screen.getByRole('status')).toHaveTextContent('URL copied')
  })

  it.each(['rejected', 'unavailable'] as const)(
    'keeps the URL selectable and allows retry when clipboard is %s',
    async (failure) => {
      const user = await openDetails()
      const clipboard = navigator.clipboard
      const writeText = vi
        .spyOn(clipboard, 'writeText')
        .mockRejectedValue(new Error('denied'))
      if (failure === 'unavailable') {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          get: () => undefined,
        })
      }
      await user.click(screen.getByRole('button', { name: 'Copy URL' }))
      expect(screen.getByRole('status')).toHaveTextContent(
        'Could not copy. Select the URL and copy it manually.',
      )
      const text = screen.getByRole('textbox', { name: 'Full URL' })
      await user.click(text)
      expect(text).toHaveFocus()
      expect(text).toHaveValue(url)
      vi.restoreAllMocks()
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      })
      const retry = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue()
      await user.click(screen.getByRole('button', { name: 'Copy URL' }))
      expect(retry).toHaveBeenCalledWith(url)
      expect(screen.getByRole('status')).toHaveTextContent('URL copied')
      expect(writeText).toHaveBeenCalledTimes(failure === 'unavailable' ? 0 : 1)
    },
  )

  it('disables copying until the clipboard operation settles', async () => {
    const user = await openDetails()
    let finish = () => {}
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockReturnValue(pending)
    const button = screen.getByRole('button', { name: 'Copy URL' })
    await user.click(button)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(writeText).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await pending
    })
    expect(button).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('URL copied')
  })

  it('supports Space, Escape, focus restoration and a fresh status on reopen', async () => {
    const user = userEvent.setup()
    render(<SavedUrlDetailsPopover url={url} title='' />)
    const trigger = screen.getByRole('button', { name: `View URL: ${url}` })
    trigger.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('dialog', { name: 'Full URL' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

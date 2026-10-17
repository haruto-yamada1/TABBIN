import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMessage } from '@/features/i18n/lib/language'

import { UrlOpeningResult } from './UrlOpeningResult'

const state = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: state.toastError } }))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) =>
      getMessage('en', key, fallback, values),
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const url = 'https://user:password@example.com/private?token=secret#anchor'
const failed = {
  status: 'complete',
  total: 2,
  opened: 1,
  failedUrls: [{ url, reason: 'permission' }],
} as const

describe('URL opening result', () => {
  it('shows counts, fixed reason and a non-navigating URL without credentials', async () => {
    const user = userEvent.setup()
    const retry = vi.fn(async () => {})
    render(<UrlOpeningResult operation={failed} onRetry={retry} />)
    expect(
      screen.getByRole('region', { name: 'URL opening result' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 / 2 URLs opened')
    expect(
      screen.getByText('The browser denied permission to open this URL.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Failed URL' })).toHaveValue(
      'https://example.com/private?token=secret#anchor',
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry failed URLs' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('copies the original URL and reports clipboard failure without raw errors', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('secret clipboard error'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<UrlOpeningResult operation={failed} onRetry={async () => {}} />)
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(writeText).toHaveBeenCalledWith(url)
    await user.click(screen.getByRole('button', { name: 'Copied' }))
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith(
        'Could not copy the URL. Select and copy it manually.',
      ),
    )
  })

  it('announces pending state without offering another open', () => {
    render(
      <UrlOpeningResult
        operation={{ status: 'running', total: 2, opened: 0, failedUrls: [] }}
        onRetry={async () => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Opening 2 URLs…')
    expect(
      screen.queryByRole('button', { name: 'Retry failed URLs' }),
    ).not.toBeInTheDocument()
  })

  it('separates an opened URL from a failed update and offers no duplicate retry', () => {
    render(
      <UrlOpeningResult
        operation={{
          status: 'complete',
          total: 1,
          opened: 1,
          failedUrls: [],
          postProcessingFailed: true,
        }}
        onRetry={async () => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('1 / 1 URLs opened')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'URLs were opened, but saved data or the list could not be updated. Reload before continuing.',
    )
    expect(
      screen.queryByRole('button', { name: 'Retry failed URLs' }),
    ).not.toBeInTheDocument()
  })
})

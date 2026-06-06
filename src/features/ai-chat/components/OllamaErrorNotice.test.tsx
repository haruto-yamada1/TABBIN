import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OllamaErrorNotice } from './OllamaErrorNotice'

const mocked = vi.hoisted(() => ({
  language: 'en' as 'en' | 'ja',
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeClipboardText: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocked.toastError,
    success: mocked.toastSuccess,
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: mocked.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(mocked.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

const baseError = {
  allowedOrigins: 'chrome-extension://test-extension-id',
  baseUrl: 'http://localhost:11434',
  downloadUrl: 'https://ollama.com/download',
  faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
  tagsUrl: 'http://localhost:11434/api/tags',
} as const

describe('OllamaErrorNotice', () => {
  beforeEach(() => {
    mocked.language = 'en'
    mocked.toastError.mockReset()
    mocked.toastSuccess.mockReset()
    mocked.writeClipboardText.mockReset()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: mocked.writeClipboardText,
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the shared ui input in the copy row and does not leave a raw input element', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './OllamaErrorNotice.tsx'),
      'utf8',
    )

    expect(source).toContain("from '@/components/ui/input'")
    expect(source).not.toContain('<input')
  })

  it('shows the Windows user-environment-variable setup steps', () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'notInstalledOrNotRunning',
        }}
        platform='win'
      />,
    )

    expect(
      screen.getByText('Open Edit the system environment variables.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'In the window that appears, select Environment Variables.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Under User variables, select New.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Copy value' }).getAttribute('title'),
    ).toBe('Copy')
  })

  it('has wrapping and scroll classes for long content', () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'forbidden',
        }}
        platform='mac'
      />,
    )

    const root = screen.getByText(
      'Ollama denied access from the extension (403 Forbidden).',
    ).parentElement

    expect(root?.className).toContain('max-h-')
    expect(root?.className).toContain('overflow-y-auto')
    expect(root?.className).toContain('overflow-x-hidden')
    expect(root?.className).toContain('[&_a]:break-all')
    expect(root?.className).toContain('[&_code]:break-all')
  })

  it('can copy the macOS command row', async () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'forbidden',
        }}
        platform='mac'
      />,
    )

    const copyButton = screen.getByRole('button', { name: 'Copy command' })

    fireEvent.click(copyButton)
    await Promise.resolve()

    expect(mocked.writeClipboardText).toHaveBeenCalledWith(
      'launchctl setenv OLLAMA_ORIGINS "chrome-extension://test-extension-id"',
    )
    expect(mocked.toastSuccess).toHaveBeenCalledWith('Copied Copy command')
    await waitFor(() => {
      expect(copyButton.getAttribute('data-state')).toBe('copied')
    })
    expect(copyButton.getAttribute('title')).toBe('Copied')

    await new Promise((resolve) => {
      setTimeout(resolve, 2100)
    })

    await waitFor(() => {
      expect(copyButton.getAttribute('data-state')).toBe('idle')
    })
    expect(copyButton.getAttribute('title')).toBe('Copy')
  })

  it('can copy the Windows value row', async () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'notInstalledOrNotRunning',
        }}
        platform='win'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }))

    await waitFor(() => {
      expect(mocked.writeClipboardText).toHaveBeenCalledWith(
        'chrome-extension://test-extension-id',
      )
    })
  })

  it('can copy the check command row', async () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'forbidden',
        }}
        platform='mac'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy check command' }))

    await waitFor(() => {
      expect(mocked.writeClipboardText).toHaveBeenCalledWith(
        'curl http://localhost:11434/api/tags',
      )
    })
  })

  it('shows an error toast when the clipboard API is unavailable', async () => {
    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'notInstalledOrNotRunning',
        }}
        platform='win'
      />,
    )

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }))

    await waitFor(() => {
      expect(mocked.toastError).toHaveBeenCalledWith(
        'Could not copy Copy value',
      )
    })
  })

  it('shows an error toast when clipboard write fails', async () => {
    mocked.writeClipboardText.mockRejectedValueOnce(new Error('failed'))

    render(
      <OllamaErrorNotice
        error={{
          ...baseError,
          kind: 'forbidden',
        }}
        platform='mac'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy check command' }))

    await waitFor(() => {
      expect(mocked.toastError).toHaveBeenCalledWith(
        'Could not copy Copy check command',
      )
    })
  })
})

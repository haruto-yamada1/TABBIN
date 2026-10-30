// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { MemoryI18nProvider } from '@/features/i18n/context/MemoryI18nProvider'

import { PracticePage } from './PracticePage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('isolated practice page', () => {
  it('uses the real saved-tabs UI with no production API access across reset and language changes', async () => {
    const accessed = vi.fn(() => {
      throw new Error('Production API accessed')
    })
    vi.stubGlobal('chrome', new Proxy({}, { get: accessed }))
    vi.stubGlobal('indexedDB', { open: accessed, deleteDatabase: accessed })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const user = userEvent.setup()
    render(
      <MemoryI18nProvider initialLanguage='en'>
        <TooltipProvider>
          <PracticePage />
        </TooltipProvider>
      </MemoryI18nProvider>,
    )
    expect(screen.getByRole('heading', { name: /Practice data/ })).toBeTruthy()
    await screen.findByRole('button', { name: 'Start empty' })
    await user.click(screen.getByRole('button', { name: 'Start empty' }))
    await user.click(
      screen.getByRole('button', { name: 'Simulate saving tabs' }),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Reset practice' }))
    await user.click(screen.getByRole('button', { name: 'Practice language' }))
    expect(screen.getByRole('heading', { name: /練習用データ/ })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '練習を終了' }).getAttribute('href'),
    ).toBe('app.html#/academy/domain-mode')
    expect(accessed).not.toHaveBeenCalled()
  })
})

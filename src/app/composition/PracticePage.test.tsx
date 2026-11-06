// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { MemoryI18nProvider } from '@/features/i18n/context/MemoryI18nProvider'

import { createPracticeComposition } from './createPracticeComposition'
import { PracticePage } from './PracticePage'

beforeEach(() => {
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
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('isolated practice page', () => {
  it('shows an operation-gated lesson instead of granting progress for visiting', async () => {
    render(
      <MemoryI18nProvider initialLanguage='en'>
        <TooltipProvider>
          <PracticePage lessonId='parent-categories' />
        </TooltipProvider>
      </MemoryI18nProvider>,
    )
    expect(await screen.findByText('0 / 4')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry step' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it.each([
    {
      language: 'en',
      retry: 'Retry step',
      message: 'Practice state could not be restored.',
    },
    {
      language: 'ja',
      retry: 'この手順をやり直す',
      message: '練習状態を戻せませんでした。',
    },
  ] as const)(
    'shows a rewind-specific error and clears it on retry in $language',
    async ({ language, retry, message }) => {
      const composition = createPracticeComposition()
      const restore = vi
        .fn(composition.captureCheckpoint())
        .mockRejectedValueOnce(new Error('restore failed'))
      vi.spyOn(composition, 'captureCheckpoint').mockReturnValueOnce(restore)
      const user = userEvent.setup()
      render(
        <MemoryI18nProvider initialLanguage={language}>
          <TooltipProvider>
            <PracticePage
              lessonId='parent-categories'
              createComposition={() => composition}
            />
          </TooltipProvider>
        </MemoryI18nProvider>,
      )
      await user.click(screen.getByRole('button', { name: retry }))
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(message),
      )
      expect(
        screen.queryByRole('button', {
          name: /Retry saving progress|進捗の保存を再試行/u,
        }),
      ).toBeNull()
      await user.click(screen.getByRole('button', { name: retry }))
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    },
  )

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
          <PracticePage lessonId='parent-categories' />
        </TooltipProvider>
      </MemoryI18nProvider>,
    )
    expect(screen.getByRole('heading', { name: /Practice data/ })).toBeTruthy()
    await screen.findByRole('button', { name: 'Start empty' })
    await user.click(screen.getByRole('button', { name: 'Start empty' }))
    expect(
      screen.queryByRole('button', { name: 'Simulate saving tabs' }),
    ).toBeNull()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Reset practice' }))
    await user.click(screen.getByRole('button', { name: 'Practice language' }))
    expect(screen.getByRole('heading', { name: /練習用データ/ })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '練習を終了' }).getAttribute('href'),
    ).toBe('app.html#/academy/parent-categories')
    expect(accessed).not.toHaveBeenCalled()
  })

  it.each(['domain-mode', 'save-tabs', 'install-extension', 'missing-lesson'])(
    'refuses %s without constructing a practice adapter',
    (lessonId) => {
      const createComposition = vi.fn(createPracticeComposition)
      render(
        <MemoryI18nProvider initialLanguage='en'>
          <TooltipProvider>
            <PracticePage
              lessonId={lessonId}
              createComposition={createComposition}
            />
          </TooltipProvider>
        </MemoryI18nProvider>,
      )
      expect(createComposition).not.toHaveBeenCalled()
    },
  )
})

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getMessage } from '@/features/i18n/lib/language'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'

import { OnboardingGuide } from './OnboardingGuide'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => getMessage('en', key) }),
}))

const listeners = new Set<ChromeOnChangedListener>()
let stored: Record<string, unknown> = {}
const get = vi.fn(async () => ({ ...stored }))
const set = vi.fn(async (value: Record<string, unknown>) => {
  stored = { ...stored, ...value }
  for (const listener of listeners) {
    listener({ onboardingDismissed: { newValue: true } }, 'local')
  }
})

beforeEach(() => {
  stored = {}
  listeners.clear()
  get.mockClear()
  set.mockClear()
  vi.stubGlobal('chrome', {
    storage: {
      local: { get, set },
      onChanged: {
        addListener: (listener: ChromeOnChangedListener) =>
          listeners.add(listener),
        removeListener: (listener: ChromeOnChangedListener) =>
          listeners.delete(listener),
      },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OnboardingGuide', () => {
  it('offers a nonmodal guide without moving focus, then remembers Skip across remounts', async () => {
    const user = userEvent.setup()
    const page = render(<button type='button'>Current page action</button>)
    await user.tab()
    const view = render(<OnboardingGuide automatic />)
    const show = await screen.findByRole('button', { name: 'Show guide' })
    expect(
      screen.getByRole('button', { name: 'Current page action' }),
    ).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(show.getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(stored).toEqual({ onboardingDismissed: true })
    view.unmount()
    page.unmount()
    render(<OnboardingGuide automatic />)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('expands the four basic operations and remembers closing the guide', async () => {
    const user = userEvent.setup()
    render(<OnboardingGuide automatic />)
    await user.click(await screen.findByRole('button', { name: 'Show guide' }))
    for (const name of [
      'Save tabs',
      'Organize with Domain / Custom',
      'Restore tabs',
      'Back up',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    await user.click(screen.getByRole('button', { name: 'Close guide' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(stored.onboardingDismissed).toBe(true)
  })

  it('can reopen manually after dismissal without changing the automatic preference', async () => {
    stored.onboardingDismissed = true
    const user = userEvent.setup()
    render(<OnboardingGuide />)
    await user.click(screen.getByRole('button', { name: 'Show guide' }))
    expect(screen.getByRole('heading', { name: 'Restore tabs' })).toBeTruthy()
    expect(set).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Close guide' }))
    await user.click(await screen.findByRole('button', { name: 'Show guide' }))
    expect(screen.getByRole('heading', { name: 'Restore tabs' })).toBeTruthy()
  })

  it('dismissal in another tab wins over a stale initial storage read and unsubscribes', async () => {
    let finishRead: (value: Record<string, unknown>) => void = () => undefined
    get.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finishRead = resolve
        }),
    )
    const view = render(<OnboardingGuide automatic />)
    for (const listener of listeners) {
      listener({ onboardingDismissed: { newValue: true } }, 'sync')
      listener({ unrelated: { newValue: true } }, 'local')
      listener({ onboardingDismissed: { newValue: true } }, 'local')
    }
    finishRead({})
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('region')).toBeNull()
    view.unmount()
    expect(listeners.size).toBe(0)
  })

  it('keeps a failed dismissal retryable without claiming it was remembered', async () => {
    set.mockRejectedValueOnce(new Error('Storage unavailable'))
    const user = userEvent.setup()
    render(<OnboardingGuide automatic />)
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(stored.onboardingDismissed).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(stored.onboardingDismissed).toBe(true)
  })

  it('leaves the initial page usable when storage cannot be read', async () => {
    get.mockRejectedValueOnce(new Error('Storage unavailable'))
    render(<OnboardingGuide automatic />)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('region')).toBeNull()
  })
})

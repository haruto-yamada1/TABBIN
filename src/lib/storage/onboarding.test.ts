import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { dismissOnboarding, readOnboardingDismissed } from './onboarding'

afterEach(() => vi.unstubAllGlobals())

describe('onboarding storage', () => {
  it.each([undefined, false, 'true', {}, 1])(
    'only treats the boolean true as a remembered dismissal: %j',
    async (value) => {
      vi.stubGlobal('browser', undefined)
      vi.stubGlobal('chrome', {
        storage: {
          local: { get: vi.fn(async () => ({ onboardingDismissed: value })) },
        },
      })
      await expect(readOnboardingDismissed()).resolves.toBe(false)
    },
  )

  it.each(['chrome', 'browser'])(
    'persists the dismissal with %s storage without touching other preferences',
    async (namespace) => {
      const stored = {
        onboardingDismissed: false,
        userSettings: { language: 'en' },
      }
      const get = vi.fn(async () => ({ ...stored }))
      const set = vi.fn(async (value: { onboardingDismissed: boolean }) => {
        Object.assign(stored, value)
      })
      vi.stubGlobal('chrome', undefined)
      vi.stubGlobal('browser', undefined)
      vi.stubGlobal(namespace, { storage: { local: { get, set } } })
      await dismissOnboarding()
      await expect(readOnboardingDismissed()).resolves.toBe(true)
      expect(stored).toEqual({
        onboardingDismissed: true,
        userSettings: { language: 'en' },
      })
      expect(set).toHaveBeenCalledWith({ onboardingDismissed: true })
      expect(get).toHaveBeenCalledWith('onboardingDismissed')
    },
  )

  it('preserves storage errors rather than pretending the dismissal was saved', async () => {
    const failure = new Error('Storage denied')
    vi.stubGlobal('browser', undefined)
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(failure),
          set: vi.fn().mockRejectedValue(failure),
        },
      },
    })
    await expect(readOnboardingDismissed()).rejects.toBe(failure)
    await expect(dismissOnboarding()).rejects.toBe(failure)
  })

  it('reports unavailable storage for both reads and writes', async () => {
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('browser', undefined)
    await expect(readOnboardingDismissed()).rejects.toThrow(
      'storage unavailable',
    )
    await expect(dismissOnboarding()).rejects.toThrow('storage unavailable')
  })
})

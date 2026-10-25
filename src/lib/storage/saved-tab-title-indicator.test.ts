import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SAVED_TAB_TITLE_ENABLED_KEY } from '@/constants/savedTabTitleIndicator'

import {
  readSavedTabTitleEnabled,
  setSavedTabTitleEnabled,
} from './saved-tab-title-indicator'

const mocks = vi.hoisted(() => ({ getChromeStorageLocal: vi.fn() }))
vi.mock('@/lib/browser/chrome-storage', () => mocks)

describe('native saved-tab title setting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults off without storage and rejects a write without storage', async () => {
    mocks.getChromeStorageLocal.mockReturnValue(null)
    await expect(readSavedTabTitleEnabled()).resolves.toBe(false)
    await expect(setSavedTabTitleEnabled(true)).rejects.toThrow('unavailable')
  })

  it.each([undefined, null, 'true', 1, {}, false])(
    'requires an explicit boolean true for %j',
    async (value) => {
      const set = vi.fn()
      mocks.getChromeStorageLocal.mockReturnValue({
        get: vi.fn(async () => ({ [SAVED_TAB_TITLE_ENABLED_KEY]: value })),
        set,
      })
      await expect(readSavedTabTitleEnabled()).resolves.toBe(false)
      expect(set).not.toHaveBeenCalled()
    },
  )

  it('persists only its device-local key and reads it again across reloads', async () => {
    const values: Record<string, unknown> = {
      userSettings: { language: 'ja' },
      savedTabs: ['untouched'],
    }
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ ...values })),
      set: vi.fn(async (next: Record<string, unknown>) => {
        Object.assign(values, next)
      }),
    })
    await expect(setSavedTabTitleEnabled(true)).resolves.toBe(true)
    await expect(readSavedTabTitleEnabled()).resolves.toBe(true)
    await expect(setSavedTabTitleEnabled(false)).resolves.toBe(false)
    await expect(readSavedTabTitleEnabled()).resolves.toBe(false)
    expect(values).toEqual({
      userSettings: { language: 'ja' },
      savedTabs: ['untouched'],
      [SAVED_TAB_TITLE_ENABLED_KEY]: false,
    })
  })

  it('preserves read and write failures so callers cannot claim success', async () => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('read failed')),
      set: vi.fn().mockRejectedValue(new Error('write failed')),
    })
    await expect(readSavedTabTitleEnabled()).rejects.toThrow('read failed')
    await expect(setSavedTabTitleEnabled(true)).rejects.toThrow('write failed')
  })
})

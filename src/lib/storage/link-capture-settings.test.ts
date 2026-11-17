import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LINK_CAPTURE_SETTINGS_KEY } from '@/constants/linkCapture'

import {
  DEFAULT_LINK_CAPTURE_SETTINGS,
  readLinkCaptureSettings,
  writeLinkCaptureSettings,
} from './link-capture-settings'

const mocks = vi.hoisted(() => ({ getChromeStorageLocal: vi.fn() }))
vi.mock('@/lib/browser/chrome-storage', () => mocks)
describe('link capture settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults OFF only when a healthy storage read has no saved preference', async () => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockResolvedValue({}),
    })
    await expect(readLinkCaptureSettings()).resolves.toEqual(
      DEFAULT_LINK_CAPTURE_SETTINGS,
    )
  })

  it.each([
    null,
    true,
    { enabled: true },
    {
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      shortcut: { ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut, code: 'Tab' },
    },
  ])('rejects corrupt preferences rather than enabling %j', async (value) => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockResolvedValue({ [LINK_CAPTURE_SETTINGS_KEY]: value }),
    })
    await expect(readLinkCaptureSettings()).rejects.toThrow('Invalid')
  })

  it('rejects unavailable storage and propagates I/O failure', async () => {
    mocks.getChromeStorageLocal.mockReturnValue(null)
    await expect(readLinkCaptureSettings()).rejects.toThrow('unavailable')
    await expect(
      writeLinkCaptureSettings(DEFAULT_LINK_CAPTURE_SETTINGS),
    ).rejects.toThrow('unavailable')
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('read failed')),
      set: vi.fn().mockRejectedValue(new Error('write failed')),
    })
    await expect(readLinkCaptureSettings()).rejects.toThrow('read failed')
    await expect(
      writeLinkCaptureSettings(DEFAULT_LINK_CAPTURE_SETTINGS),
    ).rejects.toThrow('write failed')
  })

  it('round trips captured physical keys without changing other settings', async () => {
    const values: Record<string, unknown> = { userSettings: { language: 'ja' } }
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ ...values })),
      set: vi.fn(async (next: Record<string, unknown>) => {
        Object.assign(values, next)
      }),
    })
    const settings = {
      enabled: true,
      shortcut: {
        ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
        code: 'F8',
        key: 'F8',
      },
    }
    await expect(writeLinkCaptureSettings(settings)).resolves.toEqual(settings)
    await expect(readLinkCaptureSettings()).resolves.toEqual(settings)
    expect(values.userSettings).toEqual({ language: 'ja' })
    await expect(
      writeLinkCaptureSettings({
        ...settings,
        shortcut: { ...settings.shortcut, code: 'Tab' },
      }),
    ).rejects.toThrow('Invalid')
  })
})

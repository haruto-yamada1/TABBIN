import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LINK_CAPTURE_SETTINGS_KEY } from '@/constants/linkCapture'

import {
  DEFAULT_LINK_CAPTURE_SETTINGS,
  LinkCaptureSettingsReadError,
  readLinkCaptureSettings,
  updateLinkCaptureSettings,
  writeLinkCaptureSettings,
} from './link-capture-settings'

const mocks = vi.hoisted(() => ({ getChromeStorageLocal: vi.fn() }))
vi.mock('@/lib/browser/chrome-storage', () => mocks)

const coordinateUpdates = () => {
  let pending: Promise<unknown> = Promise.resolve()
  const request = vi.fn(
    async (
      _name: string,
      _options: unknown,
      operation: () => Promise<unknown>,
    ) => {
      const result = pending.then(operation, operation)
      pending = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  )
  vi.stubGlobal('navigator', { locks: { request } })
  return request
}

describe('link capture settings', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('defaults OFF only when a healthy storage read has no saved preference', async () => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockResolvedValue({}),
    })
    await expect(readLinkCaptureSettings()).resolves.toEqual(
      DEFAULT_LINK_CAPTURE_SETTINGS,
    )
    await expect(readLinkCaptureSettings()).resolves.toMatchObject({
      enabled: false,
      clickEnabled: false,
      clickShortcut: { code: 'KeyZ' },
    })
  })

  it('migrates rectangle-only preferences with independent click capture OFF', async () => {
    const legacy = {
      enabled: true,
      shortcut: {
        ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
        code: 'F8',
        key: 'F8',
      },
    }
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockResolvedValue({ [LINK_CAPTURE_SETTINGS_KEY]: legacy }),
    })
    await expect(readLinkCaptureSettings()).resolves.toMatchObject({
      ...legacy,
      clickEnabled: false,
      clickShortcut: { code: 'KeyZ' },
    })
  })

  it('stores click settings independently and rejects standard modified-link operations', async () => {
    const set = vi.fn(async () => {})
    mocks.getChromeStorageLocal.mockReturnValue({ set })
    const next = {
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      clickEnabled: true,
      clickShortcut: {
        ...DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
        code: 'Semicolon',
        key: 'ö',
      },
    }
    await expect(writeLinkCaptureSettings(next)).resolves.toEqual(next)
    expect(set).toHaveBeenCalledWith({ [LINK_CAPTURE_SETTINGS_KEY]: next })
    await Promise.all(
      ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].map(async (modifier) =>
        expect(
          writeLinkCaptureSettings({
            ...next,
            clickShortcut: { ...next.clickShortcut, [modifier]: true },
          }),
        ).rejects.toThrow('Invalid'),
      ),
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
    {
      enabled: true,
      shortcut: DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
      clickEnabled: true,
    },
    {
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      clickEnabled: 'true',
    },
    {
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
      clickShortcut: null,
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
      ...DEFAULT_LINK_CAPTURE_SETTINGS,
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

  it('serializes read-modify-write across separate Options module instances and reads latest state inside the shared lock', async () => {
    const request = coordinateUpdates()
    const stored: Record<string, unknown> = {
      [LINK_CAPTURE_SETTINGS_KEY]: structuredClone(
        DEFAULT_LINK_CAPTURE_SETTINGS,
      ),
    }
    const firstWrite = Promise.withResolvers<undefined>()
    const get = vi.fn(async () => structuredClone(stored))
    const set = vi.fn(async (values: Record<string, unknown>) => {
      if (set.mock.calls.length === 1) {
        await firstWrite.promise
      }
      Object.assign(stored, values)
    })
    mocks.getChromeStorageLocal.mockReturnValue({ get, set })
    vi.resetModules()
    const otherPage = await import('./link-capture-settings')
    const first = updateLinkCaptureSettings({ enabled: true })
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1))
    const second = otherPage.updateLinkCaptureSettings({ clickEnabled: true })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith(
      'tabbin:link-capture-settings:v1',
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(get).toHaveBeenCalledTimes(1)
    firstWrite.resolve(undefined)
    await Promise.all([first, second])
    expect(stored[LINK_CAPTURE_SETTINGS_KEY]).toMatchObject({
      enabled: true,
      clickEnabled: true,
    })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('releases coordination after a failed read and lets a later update retry without writing stale settings', async () => {
    coordinateUpdates()
    const set = vi.fn(async () => {})
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error('private read failure'))
        .mockResolvedValue({
          [LINK_CAPTURE_SETTINGS_KEY]: DEFAULT_LINK_CAPTURE_SETTINGS,
        }),
      set,
    })
    await expect(
      updateLinkCaptureSettings({ enabled: true }),
    ).rejects.toBeInstanceOf(LinkCaptureSettingsReadError)
    expect(set).not.toHaveBeenCalled()
    await expect(
      updateLinkCaptureSettings({ clickEnabled: true }),
    ).resolves.toMatchObject({ enabled: false, clickEnabled: true })
    expect(set).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'rejected'])(
    'fails closed without reading or writing when coordination is %s',
    async (failure) => {
      const get = vi.fn()
      const set = vi.fn()
      mocks.getChromeStorageLocal.mockReturnValue({ get, set })
      vi.stubGlobal(
        'navigator',
        failure === 'missing'
          ? undefined
          : {
              locks: {
                request: vi
                  .fn()
                  .mockRejectedValue(new Error('Lock unavailable')),
              },
            },
      )
      await expect(
        updateLinkCaptureSettings({ enabled: true }),
      ).rejects.toThrow(/coordination is unavailable|Lock unavailable/)
      expect(get).not.toHaveBeenCalled()
      expect(set).not.toHaveBeenCalled()
    },
  )
})

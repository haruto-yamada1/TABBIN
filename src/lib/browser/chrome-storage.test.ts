import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  getChromeStorage,
  getChromeStorageLocal,
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from './chrome-storage'

type GlobalWithChrome = Omit<typeof globalThis, 'chrome'> & {
  chrome?: typeof chrome | undefined
}

const globalWithChrome = globalThis as GlobalWithChrome
const originalChrome = globalWithChrome.chrome

describe('chrome-storage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('browser', undefined)
    globalWithChrome.chrome = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalWithChrome.chrome = originalChrome
  })

  it('chrome.storage が無い場合は null を返す', () => {
    expect(getChromeStorage()).toBeNull()

    globalWithChrome.chrome = {} as typeof chrome
    expect(getChromeStorage()).toBeNull()
  })

  it('chrome.storage / local / onChanged を取得できる', () => {
    const local = {
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as typeof chrome.storage.local
    const onChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as typeof chrome.storage.onChanged
    const storage = {
      local,
      onChanged,
    } as unknown as typeof chrome.storage

    globalWithChrome.chrome = {
      storage,
    } as unknown as typeof chrome

    expect(getChromeStorage()).toBe(storage)
    expect(getChromeStorageLocal()).toBe(local)
    expect(getChromeStorageOnChanged()).toBe(onChanged)
  })

  it('local または onChanged が無い場合はそれぞれ null を返す', () => {
    globalWithChrome.chrome = {
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      } as unknown as typeof chrome.storage,
    } as unknown as typeof chrome

    expect(getChromeStorageLocal()).toBeNull()
    expect(getChromeStorageOnChanged()).not.toBeNull()

    globalWithChrome.chrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      } as unknown as typeof chrome.storage,
    } as unknown as typeof chrome

    expect(getChromeStorageLocal()).not.toBeNull()
    expect(getChromeStorageOnChanged()).toBeNull()
  })

  it('prefers Firefox Promise storage over the callback-only chrome namespace', async () => {
    const callbackOnlyGet = vi.fn(() => undefined)
    globalWithChrome.chrome = {
      storage: { local: { get: callbackOnlyGet } },
    } as unknown as typeof chrome
    const onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
    const local = {
      get: vi.fn(async () => ({ theme: 'dark' })),
      set: vi.fn(async () => undefined),
    }
    vi.stubGlobal('browser', { storage: { local, onChanged } })

    await expect(getChromeStorageLocal()?.get('theme')).resolves.toEqual({
      theme: 'dark',
    })
    await expect(
      getChromeStorageLocal()?.set({ theme: 'light' }),
    ).resolves.toBeUndefined()
    expect(local.set).toHaveBeenCalledWith({ theme: 'light' })
    expect(getChromeStorageOnChanged()).toBe(onChanged)
    expect(callbackOnlyGet).not.toHaveBeenCalled()
  })

  it('preserves Firefox storage rejections without retrying the chrome namespace', async () => {
    const failure = new Error('storage access denied')
    const chromeGet = vi.fn()
    globalWithChrome.chrome = {
      storage: { local: { get: chromeGet } },
    } as unknown as typeof chrome
    vi.stubGlobal('browser', {
      storage: { local: { get: vi.fn().mockRejectedValue(failure) } },
    })

    await expect(getChromeStorageLocal()?.get('theme')).rejects.toBe(failure)
    expect(chromeGet).not.toHaveBeenCalled()
  })

  it('keeps Chrome storage when the browser namespace has no storage API', () => {
    const local = { get: vi.fn(), set: vi.fn() }
    globalWithChrome.chrome = {
      storage: { local },
    } as unknown as typeof chrome
    vi.stubGlobal('browser', { storage: null })

    expect(getChromeStorageLocal()).toBe(local)
  })

  it('warnMissingChromeStorage は同一コンテキストで重複警告しない', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)

    warnMissingChromeStorage('chrome-storage.test/context-a')
    warnMissingChromeStorage('chrome-storage.test/context-a')
    warnMissingChromeStorage('chrome-storage.test/context-b')

    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      'chrome-storage.test/context-a',
    )
    expect(warnSpy.mock.calls[1]?.[0]).toContain(
      'chrome-storage.test/context-b',
    )
  })
})

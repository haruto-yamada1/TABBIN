import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    globalWithChrome.chrome = undefined
  })

  afterEach(() => {
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

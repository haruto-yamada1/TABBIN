import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  readLocalStorage,
  writeLocalStorage,
} from '@/lib/storage/local-storage-adapter'

const originalWindow = globalThis.window

afterEach(() => {
  // Restore window if it was deleted by a test
  if (originalWindow === undefined) {
    delete (globalThis as Record<string, unknown>).window
  } else {
    globalThis.window = originalWindow
  }
  vi.restoreAllMocks()
})

describe('local-storage-adapter', () => {
  describe('readLocalStorage', () => {
    it('window.localStorage から値を読み込む', () => {
      const getItem = vi.fn().mockReturnValue('42')
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: { getItem } },
        configurable: true,
      })

      expect(readLocalStorage('sidebar-width')).toBe('42')
      expect(getItem).toHaveBeenCalledWith('sidebar-width')
    })

    it('window.localStorage.getItem が null を返す場合は null を返す', () => {
      const getItem = vi.fn().mockReturnValue(null)
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: { getItem } },
        configurable: true,
      })

      expect(readLocalStorage('missing-key')).toBeNull()
    })

    it('window が未定義の場合は null を返す', () => {
      delete (globalThis as Record<string, unknown>).window

      expect(readLocalStorage('any-key')).toBeNull()
    })

    it('localStorage.getItem が例外を投げた場合は null を返す', () => {
      const getItem = vi.fn().mockImplementation(() => {
        throw new Error('SecurityError')
      })
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: { getItem } },
        configurable: true,
      })

      expect(readLocalStorage('blocked-key')).toBeNull()
    })
  })

  describe('writeLocalStorage', () => {
    it('window.localStorage に値を書き込む', () => {
      const setItem = vi.fn()
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: { setItem } },
        configurable: true,
      })

      writeLocalStorage('sidebar-width', '320')

      expect(setItem).toHaveBeenCalledWith('sidebar-width', '320')
    })

    it('window が未定義の場合は何もしない', () => {
      delete (globalThis as Record<string, unknown>).window

      // Should not throw
      writeLocalStorage('any-key', 'value')
    })

    it('localStorage.setItem が例外を投げた場合は何もしない', () => {
      const setItem = vi.fn().mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: { setItem } },
        configurable: true,
      })

      // Should not throw
      writeLocalStorage('overflow-key', 'x'.repeat(10_000_000))
    })
  })
})

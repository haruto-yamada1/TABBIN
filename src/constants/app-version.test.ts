import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getAppVersion } from './app-version'

type GlobalWithChrome = Omit<typeof globalThis, 'chrome'> & {
  chrome?: {
    runtime?: {
      getManifest?: () => { version?: string }
    }
  }
}

const globalWithChrome = globalThis as GlobalWithChrome
const originalChrome = globalWithChrome.chrome

describe('getAppVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    globalWithChrome.chrome = originalChrome
  })

  it('build-time に注入された __APP_VERSION__ があればそれを返す', () => {
    vi.stubGlobal('__APP_VERSION__', '2.0.8')
    expect(getAppVersion()).toBe('2.0.8')
  })

  it('__APP_VERSION__ が未定義なら manifest version を返す', () => {
    const getManifest = vi.fn(() => ({ version: '9.9.9' }))
    globalWithChrome.chrome = {
      runtime: {
        getManifest,
      },
    }

    expect(getAppVersion()).toBe('9.9.9')
  })

  it('manifest version も空ならデフォルト値を返す', () => {
    const getManifest = vi.fn(() => ({}))
    globalWithChrome.chrome = {
      runtime: {
        getManifest,
      },
    }

    expect(getAppVersion()).toBe('1.0.0')
  })
})

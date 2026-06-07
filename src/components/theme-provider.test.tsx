// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageLocal: vi.fn(),
  getChromeStorageOnChanged: vi.fn(),
  warnMissingChromeStorage: vi.fn(),
}))

import {
  getChromeStorageLocal,
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import { ThemeProvider, useTheme } from './theme-provider'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const storageListeners: StorageListener[] = []

const storageLocalMock = {
  get: vi.fn(),
  set: vi.fn(),
}

const storageOnChangedMock = {
  addListener: vi.fn((listener: StorageListener) => {
    storageListeners.push(listener)
  }),
  removeListener: vi.fn((listener: StorageListener) => {
    const index = storageListeners.indexOf(listener)
    if (index >= 0) {
      storageListeners.splice(index, 1)
    }
  }),
}

let storageValues: Record<string, unknown>
let prefersDark = false

const setMatchMediaMock = () => {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: prefersDark,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

const HookConsumer = () => {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <span data-testid='theme'>{theme}</span>
      <button
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          setTheme('user')
        }}
        type='button'
      >
        set-user
      </button>
      <button
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          setTheme('dark')
        }}
        type='button'
      >
        set-dark
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    storageListeners.length = 0
    storageValues = {}
    prefersDark = false
    setMatchMediaMock()

// eslint-disable-next-line typescript/require-await
    storageLocalMock.get.mockImplementation(async (key: string) => ({
      [key]: storageValues[key],
    }))
    storageLocalMock.set.mockResolvedValue(undefined)

    vi.mocked(getChromeStorageLocal).mockReturnValue(
      storageLocalMock as unknown as typeof chrome.storage.local,
    )
    vi.mocked(getChromeStorageOnChanged).mockReturnValue(
      storageOnChangedMock as unknown as typeof chrome.storage.onChanged,
    )
  })

  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.removeAttribute('style')
  })

  it('chrome.storage が利用できない環境でも警告しつつテーマを更新できる', async () => {
    vi.mocked(getChromeStorageLocal).mockReturnValue(null)
    vi.mocked(getChromeStorageOnChanged).mockReturnValue(null)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider defaultTheme='user'>{children}</ThemeProvider>
    )
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBe('user')

    act(() => {
      result.current.setTheme('dark')
    })

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    expect(vi.mocked(warnMissingChromeStorage).mock.calls).toStrictEqual(
      expect.arrayContaining([
        ['テーマ読み込み'],
        ['テーマ変更監視'],
        ['ユーザーテーマ適用'],
        ['ユーザーテーマ色監視'],
        ['テーマ保存'],
      ]),
    )
  })

  it('system テーマで prefers-color-scheme が light のとき light を適用する', () => {
    render(
      <ThemeProvider defaultTheme='system'>
        <div>theme-ready</div>
      </ThemeProvider>,
    )

    expect(screen.getByText('theme-ready')).toBeTruthy()
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('保存済みテーマを読み込み、ストレージ変更を反映し、アンマウント時にリスナー解除する', async () => {
    storageValues['tab-manager-theme'] = 'dark'

    const { unmount } = render(
      <ThemeProvider>
        <HookConsumer />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
    expect(storageOnChangedMock.addListener).toHaveBeenCalledTimes(3)

    const themeChangeListener = storageListeners[0]
    expect(themeChangeListener).toStrictEqual(expect.any(Function))

    act(() => {
      themeChangeListener(
        {
          tabManagerTheme: {
            oldValue: 'dark',
            newValue: 'light',
          },
        },
        'local',
      )
    })
    expect(screen.getByTestId('theme').textContent).toBe('dark')

    act(() => {
      themeChangeListener(
        {
          'tab-manager-theme': {
            oldValue: 'dark',
            newValue: 'light',
          },
        },
        'sync',
      )
    })
    expect(screen.getByTestId('theme').textContent).toBe('dark')

    act(() => {
      themeChangeListener(
        {
          'tab-manager-theme': {
            oldValue: 'dark',
            newValue: 'light',
          },
        },
        'local',
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('light')
    })
    expect(document.documentElement.classList.contains('light')).toBe(true)

    const subscribedListeners = [...storageListeners]
    const removeCallsBeforeUnmount =
      storageOnChangedMock.removeListener.mock.calls.length
    unmount()

    expect(storageOnChangedMock.removeListener).toHaveBeenCalledTimes(
      removeCallsBeforeUnmount + 2,
    )
    expect(
      storageOnChangedMock.removeListener.mock.calls
        .slice(removeCallsBeforeUnmount)
        .map((call) => call[0]), // eslint-disable-line
    ).toStrictEqual(expect.arrayContaining(subscribedListeners))
  })

  it('system テーマで prefers-color-scheme が dark のとき dark を適用する', () => {
    prefersDark = true
    setMatchMediaMock()

    render(
      <ThemeProvider defaultTheme='system'>
        <div>theme-ready</div>
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('user テーマで userSettings が無い場合は CSS 変数を更新しない', async () => {
    render(
      <ThemeProvider defaultTheme='user'>
        <div>user-theme</div>
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(storageLocalMock.get).toHaveBeenCalledWith('userSettings')
    })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
    expect(
      document.documentElement.style.getPropertyValue('--app-font-scale'),
    ).toBe('1')
  })

  it('user テーマの色適用と userSettings 変更イベントを反映する', async () => {
    storageValues.userSettings = {
      colors: {
        accent: '#111111',
        surface: '#f5f5f5',
      },
      fontSizePercent: 125,
    }

    render(
      <ThemeProvider>
        <HookConsumer />
      </ThemeProvider>,
    )

    const initialColorListener = storageListeners[1]
    act(() => {
      initialColorListener(
        {
          userSettings: {
            oldValue: { colors: { accent: '#000000' } },
            newValue: { colors: { accent: '#222222' } },
          },
        },
        'local',
      )
    })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'set-user' }))

    await waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('user')
    })
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
        '#111111',
      )
    })
    expect(
      document.documentElement.style.getPropertyValue('--app-font-scale'),
    ).toBe('1.25')
    expect(document.documentElement.style.getPropertyValue('--surface')).toBe(
      '#f5f5f5',
    )
    expect(storageLocalMock.set).toHaveBeenCalledWith({
      'tab-manager-theme': 'user',
    })

    const userColorListener = storageListeners[1]
    act(() => {
      userColorListener(
        {
          userSettings: {
            oldValue: { colors: { accent: '#111111' } },
            newValue: { colors: { accent: '#333333' } },
          },
        },
        'sync',
      )
    })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      '#111111',
    )

    act(() => {
      userColorListener(
        {
          userSettings: {
            oldValue: { colors: { accent: '#111111' } },
            newValue: {
              colors: {
                accent: '#333333',
                surface: '#eeeeee',
              },
              fontSizePercent: 150,
            },
          },
        },
        'local',
      )
    })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      '#333333',
    )
    expect(document.documentElement.style.getPropertyValue('--surface')).toBe(
      '#eeeeee',
    )
    expect(
      document.documentElement.style.getPropertyValue('--app-font-scale'),
    ).toBe('1.5')
  })

  it('system テーマでもフォント倍率を初期読込と設定変更で反映する', async () => {
    storageValues.userSettings = {
      fontSizePercent: 140,
    }

    render(
      <ThemeProvider defaultTheme='system'>
        <div>system-theme</div>
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue('--app-font-scale'),
      ).toBe('1.4')
    })

    const userSettingsListener = storageListeners[1]

    act(() => {
      userSettingsListener(
        {
          userSettings: {
            oldValue: {
              fontSizePercent: 140,
            },
            newValue: {
              fontSizePercent: 160,
            },
          },
        },
        'local',
      )
    })

    expect(
      document.documentElement.style.getPropertyValue('--app-font-scale'),
    ).toBe('1.6')
  })
})

describe('useTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Provider 外では初期値を返し no-op setter を呼んでも例外にならない', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('system')
    expect(() => {
      result.current.setTheme('dark')
    }).not.toThrow()
  })

  it('React.use が undefined を返した場合はエラーを投げる', async () => {
    vi.resetModules()
    vi.doMock('react', async () => {
// eslint-disable-next-line typescript/consistent-type-imports
      const actual = await vi.importActual<typeof import('react')>('react')

      return {
        ...actual,
        use: vi.fn(() => undefined),
      }
    })
    vi.doMock('@/lib/browser/chrome-storage', () => ({
      getChromeStorageLocal: vi.fn(),
      getChromeStorageOnChanged: vi.fn(),
      warnMissingChromeStorage: vi.fn(),
    }))

    const { useTheme: mockedUseTheme } = await import('./theme-provider')

    expect(() => renderHook(() => mockedUseTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
  })
})

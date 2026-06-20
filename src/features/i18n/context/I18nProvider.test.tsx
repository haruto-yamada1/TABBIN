// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { useI18nText } from '@/features/i18n/lib/useI18nText'

import { I18nProvider, useI18n, useOptionalI18n } from './I18nProvider'
import { getFallbackText } from './I18nProvider.utils'

const mocks = vi.hoisted(() => ({
  getChromeStorageOnChanged: vi.fn(),
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
  warnMissingChromeStorage: vi.fn(),
}))

vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageOnChanged: mocks.getChromeStorageOnChanged,
  warnMissingChromeStorage: mocks.warnMissingChromeStorage,
}))

vi.mock('@/lib/storage/settings', async () => {
  // eslint-disable-next-line typescript/consistent-type-imports
  const actual = await vi.importActual<typeof import('@/lib/storage/settings')>(
    '@/lib/storage/settings',
  )

  return {
    ...actual,
    getUserSettings: mocks.getUserSettings,
    saveUserSettings: mocks.saveUserSettings,
  }
})

const Consumer = () => {
  const { language, languageSetting, setLanguageSetting, t } = useI18n()
  const text = useI18nText()
  return (
    <div>
      <span data-testid='language'>{language}</span>
      <span data-testid='setting'>{languageSetting}</span>
      <span data-testid='message'>
        {t('common.cancel')}:
        {text('missing.key', 'Hello {{name}}', {
          name: 'Taro',
        })}
      </span>
      <button
        type='button'
        onClick={() => {
          void setLanguageSetting('en')
        }}
      >
        set-en
      </button>
    </div>
  )
}

const OptionalConsumer = () => {
  const context = useOptionalI18n()
  const text = useI18nText()
  return (
    <span data-testid='optional'>
      {context ? 'present' : text('missing.key', 'Fallback')}
    </span>
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    })
    globalThis.chrome = {
      i18n: {
        getUILanguage: vi.fn(() => 'ja-JP'),
      },
    } as unknown as typeof chrome
    mocks.getUserSettings.mockResolvedValue({})
    mocks.saveUserSettings.mockResolvedValue(undefined)
    mocks.getChromeStorageOnChanged.mockReturnValue({
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('設定を読み込み system 言語をUIロケールから解決し保存変更できる', async () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('ja')
    })
    expect(screen.getByTestId('setting').textContent).toBe('system')
    expect(screen.getByTestId('message').textContent).toContain('キャンセル')
    expect(screen.getByTestId('message').textContent).toContain('Hello Taro')

    await act(async () => {
      screen.getByText('set-en').click()
    })

    expect(mocks.saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en',
      }),
    )
    expect(screen.getByTestId('language').textContent).toBe('en')
  })

  it('storage change を購読し local userSettings だけ反映して unmount で解除する', async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    mocks.getChromeStorageOnChanged.mockReturnValue({
      addListener,
      removeListener,
    })

    const { unmount } = render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    )
    await waitFor(() => {
      expect(addListener).toHaveBeenCalled()
    })
    const listener = addListener.mock.calls[0][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => void

    act(() => {
      listener({}, 'sync')
      listener({}, 'local')
      listener(
        {
          userSettings: {
            newValue: {
              language: 'en',
            },
          },
        },
        'local',
      )
    })
    expect(screen.getByTestId('language').textContent).toBe('en')

    act(() => {
      listener(
        {
          userSettings: {
            newValue: {},
          },
        },
        'local',
      )
    })
    expect(screen.getByTestId('setting').textContent).toBe('system')

    unmount()
    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it('storage listener がない環境では警告し、fallback text は navigator 言語を使う', async () => {
    delete (globalThis as { chrome?: unknown }).chrome
    mocks.getChromeStorageOnChanged.mockReturnValue(undefined)
    mocks.getUserSettings.mockRejectedValue(new Error('read failed'))

    const { unmount } = render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(mocks.warnMissingChromeStorage).toHaveBeenCalledWith(
        '言語設定変更監視',
      )
    })
    expect(
      getFallbackText('missing.key', 'Fallback {{value}}', {
        value: 'Text',
      }),
    ).toBe('Fallback Text')
    unmount()
  })

  it('設定読み込み完了前に unmount されたら状態を更新しない', async () => {
    let resolveSettings:
      | ((settings: Awaited<ReturnType<typeof mocks.getUserSettings>>) => void)
      | undefined
    mocks.getUserSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve
      }),
    )

    const { unmount } = render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    )

    unmount()

    await act(async () => {
      resolveSettings?.({ language: 'en' })
    })

    expect(mocks.saveUserSettings).not.toHaveBeenCalled()
  })

  it('chrome.i18n がない場合は navigator 言語で fallback text を解決する', () => {
    globalThis.chrome = {} as typeof chrome

    expect(getFallbackText('common.cancel')).toBe('Cancel')
  })

  it('Provider 外の optional/text hooks は fallback を返し useI18n は例外にする', () => {
    render(<OptionalConsumer />)

    expect(screen.getByTestId('optional').textContent).toBe('Fallback')
    expect(() => render(<Consumer />)).toThrow(
      'useI18n must be used within I18nProvider',
    )
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getChangelogItems } from '@/features/i18n/messages'

const mocked = vi.hoisted(() => ({
  createRoot: vi.fn(),
  renderRoot: vi.fn(),
  currentLanguage: 'ja' as 'ja' | 'en',
}))

vi.mock('react-dom/client', () => ({
  createRoot: mocked.createRoot,
}))

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useI18n: () => ({
    language: mocked.currentLanguage,
    t: (key: string, fallback?: string) => {
      if (key === 'changelog.heading') {
        return mocked.currentLanguage === 'en'
          ? 'Release Notes'
          : 'リリースノート'
      }

      return fallback ?? key
    },
  }),
}))

const importModule = async () => {
  vi.resetModules()
  mocked.createRoot.mockReturnValue({
    render: mocked.renderRoot,
  })
  return import('./main')
}

describe('changelog bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('DOMContentLoaded で app 要素へ render する', async () => {
    let domReadyHandler: EventListener | undefined

    vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string,
      callback: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === 'DOMContentLoaded' && typeof callback === 'function') {
        domReadyHandler = callback
      }
    }) as typeof document.addEventListener)

    await importModule()
    document.body.innerHTML = '<div id="app"></div>'
    domReadyHandler?.(new Event('DOMContentLoaded'))

    expect(mocked.createRoot).toHaveBeenCalledWith(
      document.querySelector('#app'),
    )
    expect(mocked.renderRoot).toHaveBeenCalledTimes(1)
  })

  it('英語のリリースノート見出しと本文を描画できる', async () => {
    mocked.currentLanguage = 'en'
    const { App, getChangelogFeatureClassName } = await importModule()

    render(createElement(App))

    expect(screen.getByRole('heading', { name: 'Release Notes' })).toBeTruthy()
    expect(
      screen.getByText(
        /sidebar chat experience that lets you work with saved tabs/i,
      ),
    ).toBeTruthy()
    expect(screen.getByText('v2.0.0')).toBeTruthy()
    expect(screen.getByText('March 14, 2026')).toBeTruthy()
    expect(document.title).toBe('Release Notes - TABBIN')
    expect(document.documentElement.lang).toBe('en')
    expect(getChangelogFeatureClassName(true)).toContain('font-medium')
    expect(getChangelogFeatureClassName(false)).toContain('text-foreground')
  })

  it('言語に応じてリリースノートの日付を整形できる', async () => {
    mocked.currentLanguage = 'ja'
    const { App } = await importModule()

    render(createElement(App))

    expect(screen.getByText('2026年3月14日')).toBeTruthy()
    expect(document.documentElement.lang).toBe('ja')
  })

  it('日本語と英語で同じリリースノート構造を保つ', () => {
    const japaneseItems = getChangelogItems('ja')
    const englishItems = getChangelogItems('en')

    expect(englishItems).toHaveLength(japaneseItems.length)
    expect(englishItems.map((item) => item.version)).toStrictEqual(
      japaneseItems.map((item) => item.version),
    )
    expect(englishItems.map((item) => item.features.length)).toStrictEqual(
      japaneseItems.map((item) => item.features.length),
    )
  })
})

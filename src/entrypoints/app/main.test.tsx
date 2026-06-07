// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  createRoot: vi.fn(),
  renderRoot: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  createRoot: mocked.createRoot,
}))

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
  }),
}))

vi.mock('@/components/ui/tooltip', () => ({
// eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/features/navigation/app/AppRouter', () => ({
  AppRouter: () => <div>AppRouter</div>,
}))

const importModule = async () => {
  vi.resetModules()
  mocked.createRoot.mockReturnValue({
    render: mocked.renderRoot,
  })
  return import('./main')
}

describe('app bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AppPage を描画できる', async () => {
    const { AppPage } = await importModule()

    render(createElement(AppPage))

    expect(screen.getByText('AppRouter')).toBeTruthy()
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

  it('同じ app 要素へ再度 mount しても createRoot を再利用する', async () => {
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
    domReadyHandler?.(new Event('DOMContentLoaded'))

    expect(mocked.createRoot).toHaveBeenCalledTimes(1)
    expect(mocked.renderRoot).toHaveBeenCalledTimes(2)
  })
})

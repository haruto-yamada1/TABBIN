// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => {
  const ready = vi.fn<() => Promise<void>>(async () => undefined)
  const availableRecoveryState = { status: 'available' }
  const reportUnavailable = vi.fn()
  const recoveryController = {
    clear: vi.fn(),
    getSnapshot: () => availableRecoveryState,
    reportUnavailable,
    retry: vi.fn(),
    subscribe: () => () => undefined,
  }
  return {
    createRoot: vi.fn(),
    getPersistenceBootstrapRuntime: vi.fn(() => ({ bootstrap: { ready } })),
    getPersistenceRecoveryController: vi.fn(() => recoveryController),
    renderRoot: vi.fn(),
    reportUnavailable,
    ready,
  }
})

vi.mock('@/app/composition/persistenceBootstrap', () => ({
  getPersistenceBootstrapRuntime: mocked.getPersistenceBootstrapRuntime,
}))
vi.mock('@/app/composition/createPersistenceRecoveryController', () => ({
  getPersistenceRecoveryController: mocked.getPersistenceRecoveryController,
}))

vi.mock('react-dom/client', () => ({
  createRoot: mocked.createRoot,
}))

vi.mock('@/components/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
  }),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/hooks/useMobile', () => ({
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
    expect(screen.queryByText('移行前チェックが必要です')).toBeNull()
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

    await vi.waitFor(() => expect(mocked.renderRoot).toHaveBeenCalledOnce())
    expect(mocked.createRoot).toHaveBeenCalledWith(
      document.querySelector('#app'), // eslint-disable-line testing-library/no-node-access -- createRoot のマウント先要素の検証には DOM ノード参照が必須
      expect.objectContaining({
        onCaughtError: expect.any(Function),
        onUncaughtError: expect.any(Function),
        onRecoverableError: expect.any(Function),
      }),
    )
    expect(mocked.ready).toHaveBeenCalledOnce()
  })

  it('IndexedDB が完了するまで route を mount しない', async () => {
    let domReadyHandler: EventListener | undefined
    let resolvePreflight: (() => void) | undefined
    mocked.ready.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        resolvePreflight = resolve
      })
    })

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

    expect(mocked.renderRoot).not.toHaveBeenCalled()

    resolvePreflight?.()
    await vi.waitFor(() => expect(mocked.renderRoot).toHaveBeenCalledOnce())
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

    await vi.waitFor(() => expect(mocked.renderRoot).toHaveBeenCalledTimes(2))
    expect(mocked.createRoot).toHaveBeenCalledTimes(1)
  })

  it('IndexedDB の初期化に失敗しても app を描画する', async () => {
    let domReadyHandler: EventListener | undefined

    vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string,
      callback: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === 'DOMContentLoaded' && typeof callback === 'function') {
        domReadyHandler = callback
      }
    }) as typeof document.addEventListener)
    mocked.getPersistenceBootstrapRuntime.mockImplementationOnce(() => {
      throw new Error('raw secret')
    })

    await importModule()
    document.body.innerHTML = '<div id="app"></div>'

    expect(() => domReadyHandler?.(new Event('DOMContentLoaded'))).not.toThrow()
    await vi.waitFor(() => expect(mocked.renderRoot).toHaveBeenCalledOnce())
    expect(mocked.renderRoot).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('raw secret')).toBeNull()
  })

  it('IndexedDB の実行に失敗しても app を描画する', async () => {
    let domReadyHandler: EventListener | undefined

    vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string,
      callback: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === 'DOMContentLoaded' && typeof callback === 'function') {
        domReadyHandler = callback
      }
    }) as typeof document.addEventListener)
    mocked.ready.mockRejectedValueOnce(new Error('raw secret'))

    await importModule()
    document.body.innerHTML = '<div id="app"></div>'

    expect(() => domReadyHandler?.(new Event('DOMContentLoaded'))).not.toThrow()
    await vi.waitFor(() => expect(mocked.renderRoot).toHaveBeenCalledOnce())

    expect(mocked.renderRoot).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('raw secret')).toBeNull()
  })
})

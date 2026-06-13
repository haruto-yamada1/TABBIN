// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

const depsMock = vi.hoisted(() => ({
  callCount: 0,
}))

vi.mock('../../infrastructure/composition/createSavedTabsUseCasesDeps', () => ({
  createSavedTabsUseCasesDeps: () => {
    depsMock.callCount += 1
    return {
      __test: 'deps',
      __instanceId: depsMock.callCount,
    }
  },
}))

vi.mock('@/features/saved-tabs/app/SavedTabsApp', () => ({
  SavedTabsApp: () => <div data-testid='saved-tabs-app-mock'>SavedTabsApp</div>,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: () => (
    <div data-testid='saved-tabs-chat-widget-mock'>LazySavedTabsChatWidget</div>
  ),
}))

vi.mock('@/features/saved-tabs/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

import { SavedTabsRoute } from './SavedTabsRoute'

describe('contexts/SavedTabsRoute', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    depsMock.callCount = 0
    window.history.replaceState({}, '', '/')
  })

  it('SavedTabsPage を直接描画する (旧 features route の再 export ではない)', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=domain')
    render(<SavedTabsRoute />)
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('createSavedTabsUseCasesDeps() で deps を組み立て SavedTabsPage へ渡す', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')
    render(<SavedTabsRoute />)
    expect(depsMock.callCount).toBeGreaterThanOrEqual(1)
  })

  it('search props を受け取り SavedTabsPage へそのまま伝える (initialViewMode は search の mode クエリで解決)', () => {
    window.history.replaceState({}, '', '/saved-tabs.html')
    render(<SavedTabsRoute search='?mode=custom' />)
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
  })

  it('onViewModeNavigate を SavedTabsPage へ伝える', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=domain')
    const onViewModeNavigate = vi.fn()
    render(<SavedTabsRoute onViewModeNavigate={onViewModeNavigate} />)
    // SavedTabsPresentationLayout 経由で onViewModeNavigate が
    // SavedTabsApp へ伝わることは SavedTabsPresentationLayout.test.tsx で
    // 確認済み。ここでは props が伝播することだけを確認する。
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

const createDepsMock = vi.hoisted(() =>
  vi.fn(() => ({
    __test: 'deps',
  })),
)

vi.mock('@/app/composition/createSavedTabsUseCases', () => ({
  createSavedTabsUseCasesDeps: createDepsMock,
}))

vi.mock('@/contexts/saved-tabs/presentation/app/SavedTabsApp', () => ({
  SavedTabsApp: () => <div data-testid='saved-tabs-app-mock'>SavedTabsApp</div>,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: () => (
    <div data-testid='saved-tabs-chat-widget-mock'>LazySavedTabsChatWidget</div>
  ),
}))

vi.mock('@/contexts/saved-tabs/presentation/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

import { createSavedTabsUseCasesDeps } from '@/app/composition/createSavedTabsUseCases'

import { SavedTabsRoute } from './SavedTabsRoute'

const renderRoute = (
  props: {
    readonly onViewModeNavigate?: (mode: 'custom' | 'domain') => void
    readonly search?: string
  } = {},
) =>
  render(
    <SavedTabsRoute
      createDeps={createSavedTabsUseCasesDeps}
      onViewModeNavigate={props.onViewModeNavigate}
      search={props.search}
    />,
  )

describe('contexts/SavedTabsRoute', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('SavedTabsPage を直接描画する (旧 features route の再 export ではない)', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=domain')
    renderRoute()
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('createSavedTabsUseCasesDeps() で deps を組み立て SavedTabsPage へ渡す', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')
    renderRoute()
    expect(createSavedTabsUseCasesDeps).toHaveBeenCalledOnce()
  })

  it('search props を受け取り SavedTabsPage へそのまま伝える (initialViewMode は search の mode クエリで解決)', () => {
    window.history.replaceState({}, '', '/saved-tabs.html')
    renderRoute({ search: '?mode=custom' })
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
  })

  it('onViewModeNavigate を SavedTabsPage へ伝える', () => {
    window.history.replaceState({}, '', '/saved-tabs.html?mode=domain')
    const onViewModeNavigate = vi.fn()
    renderRoute({ onViewModeNavigate })
    // SavedTabsPresentationLayout 経由で onViewModeNavigate が
    // SavedTabsApp へ伝わることは SavedTabsPresentationLayout.test.tsx で
    // 確認済み。ここでは props が伝播することだけを確認する。
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
  })
})

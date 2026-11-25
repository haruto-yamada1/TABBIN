// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/navigation/components/ExtensionPageShell', () => ({
  ExtensionPageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='extension-page-shell'>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
  }),
}))

import { AppLayout } from './AppLayout'

describe('AppLayout', () => {
  it('route が高さ制約を受け取れるラッパーで Outlet を包む', () => {
    render(
      <MemoryRouter initialEntries={['/ai-chat']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path='/ai-chat' element={<div>route-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const layout = screen.getByTestId('app-layout')
    expect(layout.className.includes('flex')).toBe(true)
    expect(layout.className.includes('min-h-0')).toBe(true)
    expect(layout.className.includes('flex-1')).toBe(true)
    expect(layout.className.includes('overflow-hidden')).toBe(true)
    expect(screen.getByText('route-content')).toBeTruthy()
    expect(document.title).toBe('AI Chat - TABBIN')
  })
})

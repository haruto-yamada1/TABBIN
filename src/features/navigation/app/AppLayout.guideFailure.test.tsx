// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { RenderErrorBoundary } from '@/lib/react/RenderErrorBoundary'

import { AppLayout } from './AppLayout'

vi.mock('@/features/academy/presentation/AcademyWelcome', () => ({
  AcademyWelcome: () => null,
}))
vi.mock('@/features/navigation/components/ExtensionPageShell', () => ({
  ExtensionPageShell: ({ children }: { children: ReactNode }) => (
    <div>
      <nav>App navigation</nav>
      {children}
    </div>
  ),
}))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: 'en' }),
}))
vi.mock('@/features/academy/presentation/AcademyScreenGuide', () => {
  throw new Error('Guide chunk unavailable')
})
afterEach(cleanup)

it('keeps the saved-tabs screen usable when the guide lazy import rejects', async () => {
  const caughtError = vi.fn()
  const handleAction = vi.fn()
  const user = userEvent.setup()
  render(
    <RenderErrorBoundary>
      <MemoryRouter
        initialEntries={['/saved-tabs?mode=domain&guide=domain-mode']}
      >
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path='/saved-tabs'
              element={
                <button type='button' onClick={handleAction}>
                  Saved tabs action
                </button>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </RenderErrorBoundary>,
    { onCaughtError: caughtError },
  )
  await waitFor(() => expect(caughtError).toHaveBeenCalled())
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('navigation').textContent).toBe('App navigation')
  await user.click(screen.getByRole('button', { name: 'Saved tabs action' }))
  expect(handleAction).toHaveBeenCalledOnce()
})

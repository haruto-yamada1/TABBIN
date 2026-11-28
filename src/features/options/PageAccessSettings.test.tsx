// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'
import { defaultSettings } from '@/lib/storage/settings'

import { PageAccessSettings } from './PageAccessSettings'

const settingsMocks = vi.hoisted(() => ({
  state: {
    isLoading: true,
    loadError: null as 'invalid' | 'unavailable' | null,
    retryLoadSettings: async () => {},
    settings: null as unknown as typeof defaultSettings,
  },
}))

const setSettingsState = (
  overrides: Partial<typeof settingsMocks.state>,
): void => {
  settingsMocks.state = {
    isLoading: false,
    loadError: null,
    retryLoadSettings: async () => {},
    settings: defaultSettings,
    ...overrides,
  }
}

vi.mock('./hooks/useSettings', () => ({
  useSettings: () => settingsMocks.state,
}))

vi.mock('./SavedTabTitleSettings', () => ({
  SavedTabTitleSettings: () => null,
}))

vi.mock('./LinkCaptureSettings', () => ({
  LinkCaptureSettings: () => null,
}))

vi.mock('./KeyboardShortcutsSettings', () => ({
  KeyboardShortcutsSettings: () => null,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages('en')
      return messages[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
})

describe('PageAccessSettings', () => {
  it('読み込み中は削除ポリシーの既定値を表示しない', () => {
    setSettingsState({ isLoading: true })

    render(<PageAccessSettings />)

    expect(screen.queryByText('Deletion policy')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('読み込み失敗時は既定値を現在値として見せず、エラーを表示する', () => {
    setSettingsState({ loadError: 'unavailable' })

    render(<PageAccessSettings />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Settings could not be read/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Not shown (setting is off)')).toBeNull()
  })

  it('読み込み完了後は保存済みの確認条件を表示する', () => {
    setSettingsState({
      settings: {
        ...defaultSettings,
        confirmDeleteAll: true,
        confirmDeleteEach: true,
      },
    })

    render(<PageAccessSettings />)

    const rowByOperation = (operationPattern: RegExp): HTMLElement =>
      screen.getByRole('row', { name: operationPattern })
    expect(
      within(rowByOperation(/Delete one saved URL/)).getByText(
        'Shown (setting is on)',
      ),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/Delete a domain group/)).getByText(
        'Shown (setting is on)',
      ),
    ).toBeTruthy()
  })
})

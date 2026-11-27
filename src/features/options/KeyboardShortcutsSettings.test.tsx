// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings'

vi.mock('@/features/i18n/lib/useI18nText', () => ({
  useI18nText: () => (key: string, fallback?: string) => fallback ?? key,
}))

describe('features/options/KeyboardShortcutsSettings', () => {
  afterEach(() => {
    cleanup()
  })

  it('既存ショートカットがキーと説明付きで一覧表示される', () => {
    render(<KeyboardShortcutsSettings />)
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy()
    // スクロール系ショートカット
    expect(screen.getByText('Scroll to previous parent category')).toBeTruthy()
    expect(screen.getByText('Scroll to next domain')).toBeTruthy()
    expect(screen.getByText('Scroll to next child category')).toBeTruthy()
    // サイドバー切り替え
    expect(screen.getByText('Toggle sidebar')).toBeTruthy()
    // キー表示
    expect(screen.getAllByText('Alt').length).toBeGreaterThanOrEqual(6)
    expect(screen.getByText('PageDown')).toBeTruthy()
    expect(screen.getByText('Ctrl / ⌘')).toBeTruthy()
  })

  it('定義件数分の行が描画される', () => {
    render(<KeyboardShortcutsSettings />)
    expect(screen.getAllByRole('term')).toHaveLength(7)
    expect(screen.getAllByRole('definition')).toHaveLength(7)
  })
})

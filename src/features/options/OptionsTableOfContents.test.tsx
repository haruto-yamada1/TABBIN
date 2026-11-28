// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'

import { OptionsTableOfContents } from './OptionsTableOfContents'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages('en')
      return messages[key] ?? key
    },
  }),
}))

vi.mock('@/features/navigation/components/SettingsCrossLink', () => ({
  SettingsCrossLink: ({ label }: { label: string }) => (
    <a href='#stub'>{label}</a>
  ),
}))

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('OptionsTableOfContents', () => {
  it('各セクションへのボタンと定期実行への相互リンクを表示する', () => {
    render(<OptionsTableOfContents />)

    expect(screen.getByRole('navigation', { name: 'Contents' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Backup & Restore' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Scheduled tasks' })).toBeTruthy()
  })

  it('セクションへの移動はリンクではなくボタンで行う（中クリックで HashRouter のルートを書き換えない）', () => {
    render(<OptionsTableOfContents />)

    expect(screen.queryByRole('link', { name: 'Backup & Restore' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Backup & Restore' }),
    ).not.toHaveAttribute('href')
  })

  it('ボタンをクリックすると対象セクションへスクロールしフォーカスも移動する', async () => {
    const user = userEvent.setup()
    const target = document.createElement('div')
    target.id = 'options-section-backup'
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.append(target)

    render(<OptionsTableOfContents />)
    await user.click(screen.getByRole('button', { name: 'Backup & Restore' }))

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(target).toHaveFocus()
  })
})

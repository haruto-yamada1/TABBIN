// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'

import { DeletePolicySettings } from './DeletePolicySettings'

const i18nMocks = vi.hoisted(() => ({
  language: 'en' as 'en' | 'ja',
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages(i18nMocks.language)
      return messages[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
  i18nMocks.language = 'en'
})

const rowByOperation = (operationPattern: RegExp): HTMLElement =>
  screen.getByRole('row', { name: operationPattern })

describe('DeletePolicySettings', () => {
  it('主要な削除操作の一覧を、確認・Undo・期間つきで表示する', () => {
    render(
      <DeletePolicySettings
        confirmDeleteAll={false}
        confirmDeleteEach={false}
      />,
    )

    expect(screen.getByText('Deletion policy')).toBeTruthy()
    expect(
      within(rowByOperation(/Delete one saved URL/)).getByText(
        'Not shown (setting is off)',
      ),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/Delete one saved URL/)).getByText('Available'),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/Delete one saved URL/)).getByText(
        'While the notification is shown',
      ),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/Delete a category/)).getByText('Always shown'),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/Delete from the review reminder/)).getByText(
        'Up to 30 minutes while the page stays open',
      ),
    ).toBeTruthy()
  })

  it('確認列は confirmDeleteEach / confirmDeleteAll の現在値に連動する', () => {
    render(<DeletePolicySettings confirmDeleteAll confirmDeleteEach />)

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

  it('日本語でも表示される', () => {
    i18nMocks.language = 'ja'
    render(
      <DeletePolicySettings
        confirmDeleteAll={false}
        confirmDeleteEach={false}
      />,
    )

    expect(screen.getByText('削除ポリシー')).toBeTruthy()
    expect(
      within(rowByOperation(/保存URLを1件削除/)).getByText(
        '通知が表示されている間',
      ),
    ).toBeTruthy()
    expect(
      within(rowByOperation(/AI提案による削除/)).getByText(
        'ページを開いている間、30分以内',
      ),
    ).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoryReorderFooter } from './Footer'

const footerI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: footerI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(footerI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

describe('CategoryReorderFooterコンポーネント', () => {
  afterEach(() => {
    cleanup()
    footerI18nState.language = 'ja'
  })

  it('キャンセル/確認ボタンをクリックするとハンドラを呼び出す', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <CategoryReorderFooter
        onConfirmCategoryReorder={onConfirm}
        onCancelCategoryReorder={onCancel}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '親カテゴリの並び替えをキャンセル' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '親カテゴリの並び替えを確定' }),
    )

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('ハンドラなしでも描画できる', () => {
    render(<CategoryReorderFooter />)

    fireEvent.click(
      screen.getByRole('button', { name: '親カテゴリの並び替えをキャンセル' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '親カテゴリの並び替えを確定' }),
    )

    expect(
      screen.getByRole('button', { name: '親カテゴリの並び替えをキャンセル' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: '親カテゴリの並び替えを確定' }),
    ).toBeTruthy()
  })

  it('renders English footer labels when the display language is en', () => {
    footerI18nState.language = 'en'

    render(<CategoryReorderFooter />)

    expect(
      screen.getByRole('button', { name: 'Cancel parent category reordering' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Confirm parent category reordering',
      }),
    ).toBeTruthy()
  })
})

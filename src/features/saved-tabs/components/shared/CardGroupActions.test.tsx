// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cardGroupActionsI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? <div data-testid='alert-dialog'>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode
    onClick?: () => void
    variant?: string
  }) => (
    <button data-variant={variant} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: cardGroupActionsI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(cardGroupActionsI18nState.language)
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

import { CardGroupActions } from './CardGroupActions'

describe('CardGroupActions', () => {
  afterEach(() => {
    cleanup()
    cardGroupActionsI18nState.language = 'ja'
  })

  it('確認なしの操作では即時に各ハンドラを呼ぶ', () => {
    const onManage = vi.fn()
    const onOpenAll = vi.fn()
    const onDeleteAll = vi.fn()

    render(
      <CardGroupActions
        onManage={onManage}
        onOpenAll={onOpenAll}
        onDeleteAll={onDeleteAll}
        manageLabel='設定'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.click(screen.getByRole('button', { name: 'すべてのタブを開く' }))
    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))

    expect(onManage).toHaveBeenCalledTimes(1)
    expect(onOpenAll).toHaveBeenCalledTimes(1)
    expect(onDeleteAll).toHaveBeenCalledTimes(1)
  })

  it('一括削除ボタンは一覧上で通常のsecondary色で表示する', () => {
    render(<CardGroupActions onDeleteAll={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'すべて削除' }).className,
    ).toContain('bg-secondary')
  })

  it('確認が必要な場合はダイアログを開いてから実行する', () => {
    const onOpenAll = vi.fn()
    const onDeleteAll = vi.fn()

    render(
      <CardGroupActions
        onOpenAll={onOpenAll}
        onDeleteAll={onDeleteAll}
        onConfirmOpenAll
        onConfirmDeleteAll
        openAllThreshold={20}
        itemName='URL'
        warningMessage='すべて削除します'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべてのタブを開く' }))
    expect(
      screen.getByText('20個以上のタブを開こうとしています。続行しますか？'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '開く' }))
    expect(onOpenAll).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))
    expect(screen.getByText('URLをすべて削除しますか？')).toBeTruthy()
    expect(screen.getByText('すべて削除します')).toBeTruthy()
    const confirmDeleteButton = screen.getByRole('button', { name: '削除' })
    expect(confirmDeleteButton.getAttribute('data-variant')).toBe('destructive')
    fireEvent.click(confirmDeleteButton)
    expect(onDeleteAll).toHaveBeenCalledTimes(1)
  })

  it('対象名付きの aria-label と確認文言を受け取れる', () => {
    const onOpenAll = vi.fn()
    const onDeleteAll = vi.fn()

    render(
      <CardGroupActions
        onOpenAll={onOpenAll}
        onDeleteAll={onDeleteAll}
        onConfirmOpenAll
        onConfirmDeleteAll
        openAllAriaLabel='「未分類のドメイン」のすべてのタブを開く'
        openAllTooltip='「未分類のドメイン」のすべてのタブを開く'
        openAllConfirmDescription='「未分類のドメイン」のタブ3件を開きます。続行しますか？'
        deleteAllAriaLabel='「未分類のドメイン」のすべてのタブを削除'
        deleteAllTooltip='「未分類のドメイン」のすべてのタブを削除'
        deleteAllConfirmDescription='「未分類のドメイン」のタブ3件をすべて削除します。この操作は元に戻せません。'
        itemName='未分類のドメイン'
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを開く',
      }),
    )
    expect(
      screen.getByText(
        '「未分類のドメイン」のタブ3件を開きます。続行しますか？',
      ),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    )
    expect(
      screen.getByText(
        '「未分類のドメイン」のタブ3件をすべて削除します。この操作は元に戻せません。',
      ),
    ).toBeTruthy()
  })
})

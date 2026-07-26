// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { TranslateFn } from './savedTabsChat/messages'
import { SavedTabsChatHistoryItemCard } from './SavedTabsChatHistoryItemCard'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

describe('SavedTabsChatHistoryItemCard', () => {
  it('説明文を 3 行で省略し tooltip に全文を載せる', () => {
    const t: TranslateFn = (key, fallback, values) => {
      const template =
        (
          {
            'aiChat.deleteConversationAria': 'Delete {{title}}',
          } satisfies Record<string, string>
        )[key] ??
        fallback ??
        key

      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    }

    render(
      createElement(SavedTabsChatHistoryItemCard, {
        historyItem: {
          id: 'conversation-1',
          isActive: true,
          preview:
            '現在のURL一覧の整理結果です。保存済みタブ総数は多く、説明文は 3 行を超えます。',
          title: 'listSavedUrlsを使ってテーブル整理',
        },
        isActive: true,
        onDeleteHistoryItem: vi.fn(),
        onSelectHistoryItem: vi.fn(),
        setIsOpen: vi.fn(),
        setPendingDeleteHistoryItem: vi.fn(),
        t,
      }),
    )

    const preview = screen.getByTestId('conversation-preview-conversation-1')
    const tooltipBody = screen.getByTestId(
      'conversation-preview-tooltip-content-conversation-1',
    )

    expect(preview).toHaveClass('line-clamp-3')
    expect(preview.className).not.toContain('block')
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      '現在のURL一覧の整理結果です。保存済みタブ総数は多く、説明文は 3 行を超えます。',
    )
    expect(tooltipBody).toHaveClass('max-h-[min(24rem,calc(100vh-2rem))]')
    expect(tooltipBody).toHaveClass('overflow-y-auto')
  })
})

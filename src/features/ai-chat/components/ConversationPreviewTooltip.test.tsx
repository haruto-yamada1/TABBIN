// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ConversationPreviewTooltip } from './ConversationPreviewTooltip'

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

describe('ConversationPreviewTooltip', () => {
  it('renders the shared preview trigger and scrollable tooltip body', () => {
    render(
      createElement(ConversationPreviewTooltip, {
        id: 'conversation-1',
        preview:
          '現在のURL一覧の整理結果です。保存済みタブ総数は多く、説明文は 3 行を超えます。',
      }),
    )

    const preview = screen.getByTestId('conversation-preview-conversation-1')
    const tooltipBody = screen.getByTestId(
      'conversation-preview-tooltip-content-conversation-1',
    )

    expect(preview).toHaveClass('line-clamp-3')
    expect(preview).toHaveClass('wrap-anywhere')
    expect(tooltipBody).toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      '現在のURL一覧の整理結果です。保存済みタブ総数は多く、説明文は 3 行を超えます。',
    )
  })
})

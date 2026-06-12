// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Conversation, ConversationContent } from './conversation'

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

describe('Conversation', () => {
  it('会話コンテナに横幅縮小用の制約を付ける', () => {
    const { container } = render(
      <Conversation>
        <ConversationContent>
          <p>message</p>
        </ConversationContent>
      </Conversation>,
    )

    expect(screen.getByRole('log').className).toContain('min-w-0')
    expect(container.textContent).toContain('message')

    const content = screen.getByText('message').closest('div')
    expect(content?.className).toContain('min-w-0')
  })
})

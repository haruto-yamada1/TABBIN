// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Message, MessageContent, MessageResponse } from './message'

describe('Message', () => {
  it('長い英字でも本文を途中改行できるクラスを持つ', () => {
    const longWord =
      'SuperLongEnglishWordWithoutNaturalBreakpointsThatShouldWrapInsideTheChatBubble'

    render(
      <Message from='assistant'>
        <MessageContent>
          <MessageResponse>{longWord}</MessageResponse>
        </MessageContent>
      </Message>,
    )

    const responseRoot = screen.getByText(longWord).parentElement
    const messageBubble = responseRoot?.parentElement
    const messageRoot = messageBubble?.parentElement

    expect(messageRoot?.className).toContain('min-w-0')
    expect(messageBubble?.className).toContain('wrap-anywhere')
    expect(messageBubble?.className).toContain('group-[.is-assistant]:w-full')
    expect(responseRoot?.className).toContain('[&_p]:wrap-anywhere')
  })

  it('markdown code blockにも折り返し用の幅制約を付ける', async () => {
    const content = [
      '```json',
      '{"projectName":"VeryLongProjectNameWithoutNaturalBreakpoints","domain":"www.youtube.com"}',
      '```',
    ].join('\n')

    const { container } = render(
      <Message from='assistant'>
        <MessageContent>
          <MessageResponse>{content}</MessageResponse>
        </MessageContent>
      </Message>,
    )

    const messageRoot = container.firstElementChild as HTMLDivElement | null
    const messageBubble =
      messageRoot?.firstElementChild as HTMLDivElement | null
    const responseRoot =
      messageBubble?.firstElementChild as HTMLDivElement | null

    await vi.dynamicImportSettled()

    expect(
      container.querySelector('[data-streamdown="code-block-body"]'),
    ).toBeTruthy()
    expect(messageBubble?.className).toContain('group-[.is-assistant]:w-full')
    expect(responseRoot?.className).toContain('[&_pre]:whitespace-pre-wrap')
    expect(responseRoot?.className).toContain('[&_pre]:wrap-anywhere')
    expect(responseRoot?.className).toContain(
      'data-[streamdown=code-block-body]:max-w-full',
    )
    expect(responseRoot?.className).toContain(
      'data-[streamdown=code-block-body]:overflow-x-hidden',
    )
  })
})

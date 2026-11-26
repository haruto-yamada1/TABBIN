// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === 'aiChat.liveResponseCompleted' ? 'AI response completed' : key,
  }),
}))

import { ChatLiveAnnouncer } from './ChatLiveAnnouncer'

describe('ChatLiveAnnouncer', () => {
  afterEach(() => {
    cleanup()
  })

  it('応答生成が完了すると polite 領域で完了を通知する', () => {
    const { rerender } = render(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting
        hasAssistantReply={false}
      />,
    )
    rerender(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply
      />,
    )

    const polite = screen.getByText('AI response completed')
    expect(polite.getAttribute('aria-live')).toBe('polite')
  })

  it('2回目の送信開始で完了文が消え、完了で再び通知する', () => {
    const { rerender } = render(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting
        hasAssistantReply={false}
      />,
    )
    rerender(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply
      />,
    )
    expect(screen.getByText('AI response completed')).toBeTruthy()

    rerender(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting
        hasAssistantReply
      />,
    )
    expect(screen.queryByText('AI response completed')).toBeNull()

    rerender(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply
      />,
    )
    expect(screen.getByText('AI response completed')).toBeTruthy()
  })

  it('送信していない状態では完了を通知しない', () => {
    render(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply
      />,
    )
    expect(screen.queryByText('AI response completed')).toBeNull()
  })

  it('エラーは assertive 領域で通知する', () => {
    render(
      <ChatLiveAnnouncer
        chatErrorMessage='Connection failed'
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply={false}
      />,
    )
    const assertive = screen.getByText('Connection failed')
    expect(assertive.getAttribute('aria-live')).toBe('assertive')
  })

  it('エラーがある場合は完了を通知しない', () => {
    const { rerender } = render(
      <ChatLiveAnnouncer
        chatErrorMessage=''
        hasOllamaError={false}
        isSubmitting
        hasAssistantReply={false}
      />,
    )
    rerender(
      <ChatLiveAnnouncer
        chatErrorMessage='Connection failed'
        hasOllamaError={false}
        isSubmitting={false}
        hasAssistantReply
      />,
    )
    expect(screen.queryByText('AI response completed')).toBeNull()
  })
})

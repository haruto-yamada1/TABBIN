import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'

type ChatLiveAnnouncerProps = {
  /** 表示中のエラーメッセージ（会話エラー） */
  chatErrorMessage: string
  /** Ollama 接続エラー等が表示中か */
  hasOllamaError: boolean
  /** 応答生成が完了した直後かどうかを判定するための送信状態 */
  isSubmitting: boolean
  /** 最後に assistant の応答が存在するか */
  hasAssistantReply: boolean
}

/**
 * AI Chat の応答完了・エラーをスクリーンリーダーへ通知する live region (#1118)。
 * 視覚表示は変えず、完了は polite、エラーは assertive で読み上げる。
 */
const ChatLiveAnnouncer = ({
  chatErrorMessage,
  hasOllamaError,
  isSubmitting,
  hasAssistantReply,
}: ChatLiveAnnouncerProps) => {
  const { t } = useI18n()
  const errorText =
    chatErrorMessage ||
    (hasOllamaError ? t('aiChat.liveErrorOccurred') : undefined)
  const [completionMessage, setCompletionMessage] = useState('')
  const wasSubmittingRef = useRef(false)

  useEffect(() => {
    if (
      wasSubmittingRef.current &&
      !isSubmitting &&
      !errorText &&
      hasAssistantReply
    ) {
      setCompletionMessage(t('aiChat.liveResponseCompleted'))
    }
    wasSubmittingRef.current = isSubmitting
  }, [errorText, hasAssistantReply, isSubmitting, t])

  return (
    <>
      <output aria-live='polite' className='sr-only'>
        {completionMessage}
      </output>
      <output aria-live='assertive' className='sr-only'>
        {errorText ?? ''}
      </output>
    </>
  )
}

export { ChatLiveAnnouncer }

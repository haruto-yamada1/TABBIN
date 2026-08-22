import { toast } from 'sonner'

import type {
  PromptInputMessage,
  PromptInputProps,
} from '@/components/ai-elements/prompt-input'
import { convertPromptInputFilesToAiChatAttachments } from '@/features/ai-chat/lib/attachments'
import type { AiChatAttachment } from '@/features/ai-chat/types'
import type { AppLanguage } from '@/features/i18n/messages'
import { connectRuntimePort } from '@/lib/browser/runtime'
import type {
  AiChatStreamServerMessage,
  OllamaErrorDetails,
} from '@/types/background'
import { AI_CHAT_STREAM_PORT_NAME } from '@/types/background'

import type { ChatMessage, ChatMessageUpdate, TranslateFn } from './messages'
import { createChatMessage, createMessageId } from './messages'
import {
  createInitialStreamingReasoning,
  getAiChatErrorMessage,
  getAiChatOllamaError,
  isAiChatStreamServerMessage,
  requestAssistantAnswer,
} from './streaming'

type UseChatStreamHandlersParams = {
  messages: ChatMessage[]
  activePortRef: {
    current: {
      disconnect: () => void
    } | null
  }
  conversationGenerationRef: { current: number }
  disconnectActivePort: () => void
  replaceMessage: (
    messageId: string,
    nextMessage: ChatMessageUpdate,
    options?: { commit?: boolean },
  ) => ChatMessage[]
  removeMessage: (
    messageId: string,
    options?: { commit?: boolean },
  ) => ChatMessage[]
  updateMessageList: (
    update: (currentMessages: ChatMessage[]) => ChatMessage[],
    options?: { commit?: boolean },
  ) => ChatMessage[]
  setInput: React.Dispatch<React.SetStateAction<string>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>
  setChatOllamaError: React.Dispatch<
    React.SetStateAction<OllamaErrorDetails | undefined>
  >
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  isConfigured: boolean
  isSubmitting: boolean
  t: TranslateFn
  language: AppLanguage
}

const useChatStreamHandlers = ({
  messages,
  activePortRef,
  conversationGenerationRef,
  disconnectActivePort,
  replaceMessage,
  removeMessage,
  updateMessageList,
  setInput,
  setErrorMessage,
  setChatOllamaError,
  setIsSubmitting,
  isConfigured,
  isSubmitting,
  t,
  language,
}: UseChatStreamHandlersParams) => {
  const isCurrentRequest = (requestGeneration: number) =>
    conversationGenerationRef.current === requestGeneration

  const setAssistantErrorState = (
    assistantMessageId: string,
    nextError: string,
    ollamaError?: OllamaErrorDetails,
  ) => {
    setErrorMessage(nextError)
    setChatOllamaError(ollamaError)

    if (ollamaError?.kind === 'forbidden') {
      removeMessage(assistantMessageId, { commit: true })
    } else {
      replaceMessage(
        assistantMessageId,
        {
          content: nextError,
          isStreaming: false,
          ...(ollamaError !== undefined ? { ollamaError } : {}),
        },
        { commit: true },
      )
    }

    setIsSubmitting(false)
  }

  const disconnectStreamPort = (streamPort: { disconnect: () => void }) => {
    if (activePortRef.current === streamPort) {
      activePortRef.current = null
    }

    streamPort.disconnect()
  }

  const handleStreamStep = (
    assistantMessageId: string,
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'step' }>,
  ) => {
    replaceMessage(assistantMessageId, {
      isStreaming: true,
      reasoning: streamMessage.reasoning,
      toolTraces: streamMessage.toolTraces,
    })
  }

  const handleStreamCompletion = (
    assistantMessageId: string,
    streamPort: { disconnect: () => void },
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'complete' }>,
  ) => {
    replaceMessage(
      assistantMessageId,
      {
        charts: streamMessage.charts,
        content: streamMessage.answer,
        isStreaming: false,
        ollamaError: undefined,
        reasoning: streamMessage.reasoning,
        toolTraces: streamMessage.toolTraces,
      },
      { commit: true },
    )
    setChatOllamaError(undefined)
    setIsSubmitting(false)
    disconnectStreamPort(streamPort)
  }

  const handleStreamFailure = (
    assistantMessageId: string,
    streamPort: { disconnect: () => void },
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'error' }>,
  ) => {
    setAssistantErrorState(
      assistantMessageId,
      streamMessage.error,
      streamMessage.ollamaError,
    )
    disconnectStreamPort(streamPort)
  }

  const handleIncomingStreamMessage = ({
    assistantMessageId,
    message,
    requestGeneration,
    streamPort,
  }: {
    assistantMessageId: string
    message: unknown
    requestGeneration: number
    streamPort: { disconnect: () => void }
  }): boolean => {
    if (!isCurrentRequest(requestGeneration)) {
      return false
    }

    if (!isAiChatStreamServerMessage(message)) {
      return false
    }

    const streamMessage: AiChatStreamServerMessage = message

    if (streamMessage.type === 'step') {
      handleStreamStep(assistantMessageId, streamMessage)
      return false
    }

    if (streamMessage.type === 'complete') {
      handleStreamCompletion(assistantMessageId, streamPort, streamMessage)
      return true
    }

    handleStreamFailure(assistantMessageId, streamPort, streamMessage)
    return true
  }

  const handleStreamDisconnect = (
    assistantMessageId: string,
    requestGeneration: number,
    streamPort: { disconnect: () => void },
    isFinished: boolean,
  ) => {
    if (activePortRef.current === streamPort) {
      activePortRef.current = null
    }

    if (!isCurrentRequest(requestGeneration) || isFinished) {
      return
    }

    setAssistantErrorState(assistantMessageId, t('aiChat.responseError'))
  }

  const startStreamingResponse = async ({
    assistantMessageId,
    attachments,
    history,
    nextPrompt,
    requestGeneration,
  }: {
    assistantMessageId: string
    attachments: AiChatAttachment[]
    history: Pick<ChatMessage, 'attachments' | 'content' | 'role'>[]
    nextPrompt: string
    requestGeneration: number
  }) => {
    try {
      const streamPort = await connectRuntimePort(AI_CHAT_STREAM_PORT_NAME)
      if (!streamPort) {
        return false
      }

      if (!isCurrentRequest(requestGeneration)) {
        streamPort.disconnect()
        return false
      }

      activePortRef.current = streamPort
      let isFinished = false

      streamPort.onMessage.addListener((message: unknown) => {
        isFinished =
          handleIncomingStreamMessage({
            assistantMessageId,
            message,
            requestGeneration,
            streamPort,
          }) || isFinished
      })

      streamPort.onDisconnect.addListener(() => {
        handleStreamDisconnect(
          assistantMessageId,
          requestGeneration,
          streamPort,
          isFinished,
        )
      })

      streamPort.postMessage({
        history,
        prompt: nextPrompt,
        type: 'run',
        ...(attachments.length > 0 ? { attachments } : {}),
        // eslint-disable-next-line unicorn/require-post-message-target-origin
      })
      return true
    } catch {
      return false
    }
  }

  const submitPrompt = async (
    rawPrompt: string,
    attachments: AiChatAttachment[] = [],
  ) => {
    const nextPrompt = rawPrompt.trim()
    if (!nextPrompt || !isConfigured || isSubmitting) {
      return
    }

    const history = messages.map((message) => ({
      ...(message.role === 'user' && message.attachments?.length
        ? { attachments: message.attachments }
        : {}),
      content: message.content,
      role: message.role,
    }))

    const assistantMessageId = createMessageId()
    const requestGeneration = conversationGenerationRef.current
    updateMessageList(
      (currentMessages) => [
        ...currentMessages,
        createChatMessage('user', nextPrompt, {
          attachments,
        }),
        {
          charts: [],
          content: '',
          id: assistantMessageId,
          isStreaming: true,
          reasoning: createInitialStreamingReasoning(nextPrompt, t),
          role: 'assistant',
          toolTraces: [],
        },
      ],
      { commit: true },
    )
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(true)

    disconnectActivePort()

    const didStartStreaming = await startStreamingResponse({
      assistantMessageId,
      attachments,
      history,
      nextPrompt,
      requestGeneration,
    })

    if (didStartStreaming) {
      return
    }

    if (!isCurrentRequest(requestGeneration)) {
      return
    }

    const response = await requestAssistantAnswer(
      history,
      nextPrompt,
      attachments,
    )
    const shouldHandleResponse = isCurrentRequest(requestGeneration)

    if (shouldHandleResponse && response?.status === 'ok' && response.answer) {
      replaceMessage(
        assistantMessageId,
        {
          charts: response.charts,
          content: response.answer,
          isStreaming: false,
          ollamaError: undefined,
          reasoning: response.reasoning,
          toolTraces: response.toolTraces,
        },
        { commit: true },
      )
      setChatOllamaError(undefined)
      setIsSubmitting(false)
      return
    }

    if (shouldHandleResponse) {
      const nextError = getAiChatErrorMessage(response, t)
      setAssistantErrorState(
        assistantMessageId,
        nextError,
        getAiChatOllamaError(response),
      )
    }
  }

  const handleSubmit: PromptInputProps['onSubmit'] = async ({
    files,
    text,
  }: PromptInputMessage) => {
    try {
      const attachments = await convertPromptInputFilesToAiChatAttachments(
        files,
        language,
      )
      await submitPrompt(text, attachments)
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('aiChat.attachments.readError')
      toast.error(errorMessage)
      throw error
    }
  }

  return {
    submitPrompt,
    handleSubmit,
  }
}

export { useChatStreamHandlers }

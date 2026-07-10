import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { AI_CHAT_MAX_ATTACHMENTS } from '@/features/ai-chat/lib/attachments'
import type {
  AiChatAttachment,
  AiChatConversationMessage,
} from '@/features/ai-chat/types'
import { sendRuntimeMessage } from '@/lib/browser/runtime'
import type {
  AiChatResponse,
  AiChatStreamServerMessage,
  OllamaErrorDetails,
  OllamaModelListResponse,
} from '@/types/background'
import { AI_CHAT_STREAM_PORT_NAME } from '@/types/background'

import type { TranslateFn } from './messages'

type ChatMessage = AiChatConversationMessage

function isAiChatResponse(value: unknown): value is AiChatResponse {
  return typeof value === 'object' && value !== null && 'status' in value
}

function isOllamaModelListResponse(
  value: unknown,
): value is OllamaModelListResponse {
  return typeof value === 'object' && value !== null && 'status' in value
}

function isAiChatStreamServerMessage(
  value: unknown,
): value is AiChatStreamServerMessage {
  return typeof value === 'object' && value !== null && 'type' in value
}

const getAiChatErrorMessage = (
  response: AiChatResponse | undefined,
  t: TranslateFn,
): string => response?.error || t('aiChat.responseError') // eslint-disable-line typescript/prefer-nullish-coalescing -- empty error should show default message

const getAiChatOllamaError = (
  response: AiChatResponse | undefined,
): OllamaErrorDetails | undefined => response?.ollamaError

type RuntimePlatformApi = {
  getPlatformInfo: (
    callback: (info: chrome.runtime.PlatformInfo) => void,
  ) => void
}

const getRuntimePlatformApi = (): RuntimePlatformApi | null => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  if (typeof chromeValue !== 'object' || chromeValue === null) {
    return null
  }
  const runtimeValue: unknown = Reflect.get(chromeValue, 'runtime')
  if (typeof runtimeValue !== 'object' || runtimeValue === null) {
    return null
  }
  const getPlatformInfoValue: unknown = Reflect.get(
    runtimeValue,
    'getPlatformInfo',
  )
  if (typeof getPlatformInfoValue !== 'function') {
    return null
  }
  return {
    getPlatformInfo: (callback) => {
      Reflect.apply(getPlatformInfoValue, runtimeValue, [callback])
    },
  }
}

const getRuntimePlatform = async (): Promise<OllamaErrorPlatform> => {
  const runtimeApi = getRuntimePlatformApi()
  if (!runtimeApi) {
    return 'unknown'
  }

  try {
    const platformInfo = await new Promise<chrome.runtime.PlatformInfo | null>(
      (resolve) => {
        runtimeApi.getPlatformInfo((info) => {
          resolve(info)
        })
      },
    )

    return platformInfo?.os === 'mac' || platformInfo?.os === 'win'
      ? platformInfo.os
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

const getAttachmentInputErrorMessage = (
  error: {
    code: 'accept' | 'max_file_size' | 'max_files'
    message: string
  },
  t: TranslateFn,
) => {
  switch (error.code) {
    case 'accept': {
      return t('aiChat.attachments.unsupportedType')
    }
    case 'max_file_size': {
      return t('aiChat.attachments.maxFileSize')
    }
    case 'max_files': {
      return t('aiChat.attachments.maxFiles', undefined, {
        count: String(AI_CHAT_MAX_ATTACHMENTS),
      })
    }
    default: {
      return error.message
    }
  }
}

const requestAssistantAnswer = async (
  history: Pick<ChatMessage, 'attachments' | 'content' | 'role'>[],
  prompt: string,
  attachments: AiChatAttachment[] = [],
): Promise<AiChatResponse | undefined> => {
  const response = await sendRuntimeMessage({
    action: 'runAiChat',
    history,
    prompt,
    ...(attachments.length > 0 ? { attachments } : {}),
  })
  return isAiChatResponse(response) ? response : undefined
}

const requestOllamaModels = async (): Promise<
  OllamaModelListResponse | undefined
> => {
  const response = await sendRuntimeMessage({
    action: 'listOllamaModels',
  })
  return isOllamaModelListResponse(response) ? response : undefined
}

const createInitialStreamingReasoning = (
  prompt: string,
  t: TranslateFn,
): string =>
  [
    t('aiChat.streaming.receivedQuestion', undefined, { prompt }),
    t('aiChat.streaming.checkingTabs'),
    t('aiChat.streaming.toolsFollow'),
  ].join('\n')

export {
  AI_CHAT_STREAM_PORT_NAME,
  createInitialStreamingReasoning,
  getAiChatErrorMessage,
  getAiChatOllamaError,
  getAttachmentInputErrorMessage,
  getRuntimePlatform,
  isAiChatResponse,
  isAiChatStreamServerMessage,
  isOllamaModelListResponse,
  requestAssistantAnswer,
  requestOllamaModels,
}

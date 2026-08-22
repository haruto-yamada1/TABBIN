/**
 * メッセージハンドラーモジュール
 */

import type { AiChatAttachment } from '@/features/ai-chat/types'
import { logger } from '@/lib/logging/logger'
import type {
  AiChatResponse,
  AiChatStreamClientMessage,
  AiChatStreamErrorMessage,
  AlarmStatusResponse,
  BackgroundMessage,
  OllamaErrorDetails,
  OllamaModelListResponse,
  StatusResponse,
  TimeRemainingResponse,
} from '@/types/background'
import {
  AI_CHAT_STREAM_PORT_NAME,
  backgroundMessageSchema,
  messageActionSchema,
} from '@/types/background'

import { listLocalOllamaModels, runAiChatRequest } from './ai-chat'
import {
  checkAndRemoveExpiredTabs,
  getExpirationPeriodMs,
  isAutoDeletePeriod,
  updateTabTimestamps,
} from './expired-tabs'
import {
  handleUrlDragStarted,
  handleUrlDropped,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
} from './url-storage'

const isOllamaErrorDetails = (value: unknown): value is OllamaErrorDetails => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    (Reflect.get(value, 'kind') === 'forbidden' ||
      Reflect.get(value, 'kind') === 'notInstalledOrNotRunning') &&
    typeof Reflect.get(value, 'faqUrl') === 'string' &&
    typeof Reflect.get(value, 'downloadUrl') === 'string' &&
    typeof Reflect.get(value, 'baseUrl') === 'string' &&
    typeof Reflect.get(value, 'tagsUrl') === 'string'
  )
}

const getOllamaErrorDetails = (
  error: unknown,
): OllamaErrorDetails | undefined => {
  if (!(error instanceof Error)) {
    return undefined
  }

  const maybeOllamaError: unknown = Reflect.get(error, 'ollamaError')

  return isOllamaErrorDetails(maybeOllamaError) ? maybeOllamaError : undefined
}

const stringifyThrownValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }

  try {
    const toStringMethod: unknown = Reflect.get(value, 'toString')
    if (typeof toStringMethod !== 'function') {
      return undefined
    }
    const result: unknown = Reflect.apply(toStringMethod, value, [])
    return typeof result === 'string' ? result : undefined
  } catch {
    // Untrusted thrown values may be Proxies or reject primitive coercion.
    return undefined
  }
}

type AiChatRequestInput = {
  attachments?: AiChatAttachment[] | undefined
  prompt: string
  history: {
    role: 'user' | 'assistant'
    content: string
    attachments?: AiChatAttachment[] | undefined
  }[]
}

const normalizeAiChatRequest = (
  message: AiChatRequestInput,
): Parameters<typeof runAiChatRequest>[0] => ({
  prompt: message.prompt,
  history: message.history.map((historyItem) => ({
    role: historyItem.role,
    content: historyItem.content,
    ...(historyItem.attachments !== undefined
      ? { attachments: historyItem.attachments }
      : {}),
  })),
  ...(message.attachments !== undefined
    ? { attachments: message.attachments }
    : {}),
})

type RuntimeOnConnect = {
  addListener: (listener: (port: chrome.runtime.Port) => void) => void
}

const isRuntimeOnConnect = (value: unknown): value is RuntimeOnConnect =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'addListener') === 'function'

const parseBackgroundMessage = (
  message: unknown,
):
  | { status: 'valid'; message: BackgroundMessage }
  | { action: string; status: 'unknown_action' }
  | { status: 'invalid_message' } => {
  if (typeof message !== 'object' || message === null) {
    return { status: 'invalid_message' }
  }

  const action: unknown = Reflect.get(message, 'action')
  if (typeof action !== 'string') {
    return { status: 'invalid_message' }
  }

  if (!messageActionSchema.safeParse(action).success) {
    return {
      action,
      status: 'unknown_action',
    }
  }

  const result = backgroundMessageSchema.safeParse(message)
  if (!result.success) {
    return { status: 'invalid_message' }
  }

  return {
    message: result.data,
    status: 'valid',
  }
}

const isAiChatStreamRunMessage = (
  message: unknown,
): message is AiChatStreamClientMessage =>
  typeof message === 'object' &&
  message !== null &&
  Reflect.get(message, 'type') === 'run'

/**
 * メッセージリスナーを設定
 */
const setupMessageListener = (): void => {
  // eslint-disable-next-line eslint/complexity
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const parsedMessage = parseBackgroundMessage(message)
    if (parsedMessage.status === 'invalid_message') {
      logger.warn('background_message_rejected', {
        errorCode: 'INVALID_MESSAGE',
      })
      sendResponse({
        status: 'invalid_message',
      })
      return false
    }

    if (parsedMessage.status === 'unknown_action') {
      logger.warn('background_message_rejected', {
        errorCode: 'UNKNOWN_ACTION',
      })
      sendResponse({
        status: 'unknown_action',
      })
      return false
    }

    const typedMessage = parsedMessage.message
    logger.info('background_message_received', {
      action: typedMessage.action,
    })
    switch (typedMessage.action) {
      case 'urlDragStarted': {
        handleUrlDragStartedMessage(typedMessage.url, sendResponse)
        return true
      }
      case 'urlDropped': {
        handleUrlDroppedMessage(
          {
            url: typedMessage.url,
            ...(typedMessage.fromExternal !== undefined
              ? { fromExternal: typedMessage.fromExternal }
              : {}),
          },
          sendResponse,
        )
        return true
      }
      case 'removeUrlFromStorage': {
        handleRemoveUrlMessage(typedMessage.url, sendResponse)
        return true
      }
      case 'removeUrlRecordsFromStorage': {
        handleRemoveUrlRecordsMessage(typedMessage.urlIds, sendResponse)
        return true
      }
      case 'calculateTimeRemaining': {
        handleCalculateTimeRemainingMessage(typedMessage, sendResponse)
        return true
      }
      case 'checkExpiredTabs': {
        handleCheckExpiredTabsMessage(
          {
            ...(typedMessage.updateTimestamps !== undefined
              ? { updateTimestamps: typedMessage.updateTimestamps }
              : {}),
            ...(typedMessage.period !== undefined
              ? { period: typedMessage.period }
              : {}),
          },
          sendResponse,
        )
        return true
      }
      case 'updateTabTimestamps': {
        handleUpdateTabTimestampsMessage(
          typedMessage.period !== undefined
            ? { period: typedMessage.period }
            : {},
          sendResponse,
        )
        return true
      }
      case 'getAlarmStatus': {
        handleGetAlarmStatusMessage(sendResponse)
        return true
      }
      case 'listOllamaModels': {
        handleListOllamaModelsMessage(sendResponse)
        return true
      }
      case 'runAiChat': {
        handleRunAiChatMessage(
          normalizeAiChatRequest(typedMessage),
          sendResponse,
        )
        return true
      }
      default: {
        const exhaustiveMessage: never = typedMessage
        void exhaustiveMessage
        return false
      }
    }
  })

  const onConnect: unknown = Reflect.get(chrome.runtime, 'onConnect')
  if (!isRuntimeOnConnect(onConnect)) {
    return
  }

  onConnect.addListener((port) => {
    if (port.name !== AI_CHAT_STREAM_PORT_NAME) {
      return
    }

    port.onMessage.addListener((message: unknown) => {
      handleAiChatStreamPortMessage(port, message)
    })
  })
}
/**
 * URLドラッグ開始メッセージの処理
 */
const handleUrlDragStartedMessage = (
  url: string,
  sendResponse: (response: StatusResponse) => void,
): void => {
  handleUrlDragStarted(url)
  sendResponse({
    status: 'ok',
  })
}
/**
 * URLドロップメッセージの処理
 */
const handleUrlDroppedMessage = (
  message: {
    url: string
    fromExternal?: boolean
  },
  sendResponse: (response: StatusResponse) => void,
): void => {
  logger.debug('background_url_drop_received', { url: message.url })

  // FromExternal フラグが true の場合のみ処理（外部ドラッグの場合のみ）
  if (message.fromExternal === true) {
    handleUrlDropped(message.url, message.fromExternal)
      .then((status) => {
        sendResponse({
          status,
        })
      })
      .catch((error: unknown) => {
        logger.error('background_url_drop_removal_failed', error)
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
        })
      })
  } else {
    logger.debug('background_url_drop_internal_skipped')
    sendResponse({
      status: 'internal_operation',
    })
  }
}
/**
 * URL削除メッセージの処理
 */
const handleRemoveUrlMessage = (
  url: string,
  sendResponse: (response: StatusResponse) => void,
): void => {
  removeUrlFromStorage(url)
    .then(() => {
      sendResponse({
        status: 'removed',
      })
    })
    .catch((error: unknown) => {
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
      })
    })
}

const handleRemoveUrlRecordsMessage = (
  urlIds: string[],
  sendResponse: (response: StatusResponse) => void,
): void => {
  removeUrlRecordsFromStorage(Array.isArray(urlIds) ? urlIds : [])
    .then((removedCount) => {
      sendResponse({
        removedCount,
        status: 'removed',
      })
    })
    .catch((error: unknown) => {
      sendResponse({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    })
}
/**
 * 残り時間計算メッセージの処理
 */
const handleCalculateTimeRemainingMessage = (
  message: {
    savedAt: number
    autoDeletePeriod: string
  },
  sendResponse: (response: TimeRemainingResponse) => void,
): void => {
  const { savedAt, autoDeletePeriod } = message
  if (!autoDeletePeriod || autoDeletePeriod === 'never' || !savedAt) {
    sendResponse({
      timeRemaining: null,
    })
    return
  }
  if (!isAutoDeletePeriod(autoDeletePeriod)) {
    sendResponse({
      timeRemaining: null,
    })
    return
  }
  try {
    const expirationMs = getExpirationPeriodMs(autoDeletePeriod)
    if (!expirationMs) {
      sendResponse({
        timeRemaining: null,
      })
      return
    }
    const now = Date.now()
    const expirationTime = savedAt + expirationMs
    const remainingMs = expirationTime - now
    sendResponse({
      expirationTime,
      timeRemaining: remainingMs,
    })
  } catch (error) {
    logger.error('background_time_remaining_calculation_failed', error)
    const errorMessage = stringifyThrownValue(error)
    sendResponse({
      timeRemaining: null,
      ...(errorMessage !== undefined ? { error: errorMessage } : {}),
    })
  }
}
/**
 * 期限切れタブチェックメッセージの処理
 */
const handleCheckExpiredTabsMessage = (
  message: {
    updateTimestamps?: boolean
    period?: string
  },
  sendResponse: (response: StatusResponse) => void,
): void => {
  logger.info('background_expired_tabs_check_requested', {
    action: 'checkExpiredTabs',
  })

  // UpdateTimestampsフラグがあり、periodも指定されている場合は時刻を更新
  if (message.updateTimestamps) {
    logger.debug('background_tab_timestamp_update_started')
    // 処理の簡略化 - まずタイムスタンプを更新し、待機せずにチェック実行
    updateTabTimestamps(message.period)
      .then((_result) => {
        logger.debug('background_tab_timestamp_update_completed')

        // 設定を再読み込みし、チェック実行
        checkAndRemoveExpiredTabs()
          .then(() => {
            logger.debug('background_expired_tabs_check_completed')
            sendResponse({
              status: 'completed',
              success: true,
            })
          })
          .catch((error: unknown) => {
            logger.error('background_expired_tabs_check_failed', error)
            sendResponse({
              error: String(error),
              status: 'error',
            })
          })
      })
      .catch((error: unknown) => {
        logger.error('background_tab_timestamp_update_failed', error)
        sendResponse({
          error: String(error),
          status: 'error',
        })
      })
  } else {
    // 単純化 - 常に強制リロードする
    checkAndRemoveExpiredTabs()
      .then(() => {
        logger.debug('background_expired_tabs_check_completed')
        sendResponse({
          status: 'completed',
        })
      })
      .catch((error: unknown) => {
        logger.error('background_expired_tabs_check_failed', error)
        sendResponse({
          error: String(error),
          status: 'error',
        })
      })
  }
}
/**
 * タイムスタンプ更新メッセージの処理
 */
const handleUpdateTabTimestampsMessage = (
  message: {
    period?: string
  },
  sendResponse: (response: StatusResponse) => void,
): void => {
  logger.debug('background_tab_timestamp_force_update_started')
  updateTabTimestamps(message.period)
    .then((result) => {
      sendResponse({
        result,
        status: 'completed',
      })
    })
    .catch((error: unknown) => {
      logger.error('background_tab_timestamp_force_update_failed', error)
      sendResponse({
        error: String(error),
        status: 'error',
      })
    })
}
/**
 * アラーム状態取得メッセージの処理
 */
const handleGetAlarmStatusMessage = (
  sendResponse: (response: AlarmStatusResponse) => void,
): void => {
  chrome.alarms.get('checkExpiredTabs', (alarm) => {
    const status = alarm
      ? {
          exists: true,
          scheduledTime: alarm.scheduledTime,
        }
      : {
          exists: false,
        }
    logger.debug('background_alarm_status_loaded', {
      action: 'getAlarmStatus',
    })
    sendResponse(status)
  })
}

const handleListOllamaModelsMessage = (
  sendResponse: (response: OllamaModelListResponse) => void,
): void => {
  listLocalOllamaModels()
    .then((models) => {
      sendResponse({
        models,
        status: 'ok',
      })
    })
    .catch((error: unknown) => {
      const ollamaError = getOllamaErrorDetails(error)
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
        ...(ollamaError !== undefined ? { ollamaError } : {}),
      })
    })
}

const handleRunAiChatMessage = (
  message: Parameters<typeof runAiChatRequest>[0],
  sendResponse: (response: AiChatResponse) => void,
): void => {
  runAiChatRequest(message)
    .then((result) => {
      sendResponse({
        answer: result.answer,
        charts: result.charts,
        reasoning: result.reasoning,
        recordCount: result.recordCount,
        status: 'ok',
        toolTraces: result.toolTraces,
      })
    })
    .catch((error: unknown) => {
      const ollamaError = getOllamaErrorDetails(error)
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
        ...(ollamaError !== undefined ? { ollamaError } : {}),
      })
    })
}

const handleAiChatStreamPortMessage = (
  port: chrome.runtime.Port,
  message: unknown,
): void => {
  if (!isAiChatStreamRunMessage(message)) {
    return
  }

  const runMessage = message
  const controller = new AbortController()

  port.onDisconnect.addListener(() => {
    controller.abort()
  })

  runAiChatRequest(normalizeAiChatRequest(runMessage), {
    onStepUpdate: (stepUpdate) => {
      if (controller.signal.aborted) {
        return
      }

      port.postMessage({
        reasoning: stepUpdate.reasoning,
        toolTraces: stepUpdate.toolTraces,
        type: 'step',
      })
    },
    signal: controller.signal,
  })
    .then((result) => {
      if (controller.signal.aborted) {
        return
      }

      port.postMessage({
        answer: result.answer,
        charts: result.charts,
        reasoning: result.reasoning,
        recordCount: result.recordCount,
        toolTraces: result.toolTraces,
        type: 'complete',
      })
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        return
      }

      const ollamaError = getOllamaErrorDetails(error)
      const errorMessage: AiChatStreamErrorMessage = {
        error: error instanceof Error ? error.message : String(error),
        type: 'error',
        ...(ollamaError !== undefined ? { ollamaError } : {}),
      }

      port.postMessage(errorMessage)
    })
}

export { setupMessageListener }

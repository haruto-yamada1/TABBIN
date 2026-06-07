/**
 * メッセージハンドラーモジュール
 */

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
import { AI_CHAT_STREAM_PORT_NAME } from '@/types/background'

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

const getOllamaErrorDetails = (
  error: unknown,
): OllamaErrorDetails | undefined => {
  if (!(error instanceof Error)) {
    return undefined
  }

  const maybeOllamaError = (
    error as Error & {
      ollamaError?: OllamaErrorDetails
    }
  ).ollamaError

  return maybeOllamaError
}

/**
 * メッセージリスナーを設定
 */
const setupMessageListener = (): void => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('バックグラウンドがメッセージを受信:', message)
    if (
      typeof message !== 'object' ||
      message === null ||
      typeof (message as Record<string, unknown>).action !== 'string'
    ) {
      sendResponse({
        status: 'invalid_message',
      })
      return false
    }
    const typedMessage = message as BackgroundMessage
    switch (typedMessage.action) {
      case 'urlDragStarted': {
        handleUrlDragStartedMessage(typedMessage.url, sendResponse)
        return true
      }
      case 'urlDropped': {
        handleUrlDroppedMessage(typedMessage, sendResponse)
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
        handleCheckExpiredTabsMessage(typedMessage, sendResponse)
        return true
      }
      case 'updateTabTimestamps': {
        handleUpdateTabTimestampsMessage(typedMessage, sendResponse)
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
        handleRunAiChatMessage(typedMessage, sendResponse)
        return true
      }
      default: {
        console.warn('未知のメッセージアクション:', message.action)
        sendResponse({
          status: 'unknown_action',
        })
        return false
      }
    }
  })

  chrome.runtime.onConnect?.addListener((port) => {
    if (port.name !== AI_CHAT_STREAM_PORT_NAME) {
      return
    }

    port.onMessage.addListener((message: AiChatStreamClientMessage) => {
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
  console.log('URLドロップを検知:', message.url)

  // FromExternal フラグが true の場合のみ処理（外部ドラッグの場合のみ）
  if (message.fromExternal === true) {
    handleUrlDropped(message.url, message.fromExternal)
      .then((status) => {
        sendResponse({
          status,
        })
      })
      .catch((error) => {
        console.error('URL削除エラー:', error)
        sendResponse({
          error: error.toString(),
          status: 'error',
        })
      })
  } else {
    console.log('内部操作のため削除をスキップ')
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
    .catch((error) => {
      sendResponse({
        error,
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
    .catch((error) => {
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
    console.error('残り時間計算エラー:', error)
    sendResponse({
      error: error?.toString(),
      timeRemaining: null,
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
  console.log('明示的な期限切れチェックリクエストを受信:', message)

  // 設定情報も出力
  chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
    userSettings?: import('@/types/storage').UserSettings
  }>(['userSettings'], (data) => {
    console.log('現在のストレージ内の設定:', data)
  })

  // UpdateTimestampsフラグがあり、periodも指定されている場合は時刻を更新
  if (message.updateTimestamps) {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    console.log(`タブの保存時刻を更新します (${message.period || '不明'})`)
    // 処理の簡略化 - まずタイムスタンプを更新し、待機せずにチェック実行
    updateTabTimestamps(message.period)
      .then((_result) => {
        console.log('タブの時刻更新完了。チェックを実行します。')

        // 設定を再読み込みし、チェック実行
        checkAndRemoveExpiredTabs()
          .then(() => {
            console.log('期限切れチェック完了')
            sendResponse({
              status: 'completed',
              success: true,
            })
          })
          .catch((error) => {
            console.error('チェックエラー:', error)
            sendResponse({
              error: String(error),
              status: 'error',
            })
          })
      })
      .catch((error) => {
        console.error('タイムスタンプ更新エラー:', error)
        sendResponse({
          error: String(error),
          status: 'error',
        })
      })
  } else {
    // 単純化 - 常に強制リロードする
    checkAndRemoveExpiredTabs()
      .then(() => {
        console.log('期限切れチェック完了')
        sendResponse({
          status: 'completed',
        })
      })
      .catch((error) => {
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
  console.log('タブの保存時刻を強制的に更新:', message.period)
  updateTabTimestamps(message.period)
    .then((result) => {
      sendResponse({
        result,
        status: 'completed',
      })
    })
    .catch((error) => {
      console.error('時刻更新エラー:', error)
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
    console.log('アラーム状態:', status)
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
    .catch((error) => {
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        ollamaError: getOllamaErrorDetails(error),
        status: 'error',
      })
    })
}

const handleRunAiChatMessage = (
  message: {
// eslint-disable-next-line typescript/consistent-type-imports
    attachments?: import('@/features/ai-chat/types').AiChatAttachment[]
    prompt: string
    history: {
      role: 'user' | 'assistant'
      content: string
// eslint-disable-next-line typescript/consistent-type-imports
      attachments?: import('@/features/ai-chat/types').AiChatAttachment[]
    }[]
  },
  sendResponse: (response: AiChatResponse) => void,
): void => {
  runAiChatRequest({
    attachments: message.attachments,
    history: message.history,
    prompt: message.prompt,
  })
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
    .catch((error) => {
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        ollamaError: getOllamaErrorDetails(error),
        status: 'error',
      })
    })
}

const handleAiChatStreamPortMessage = (
  port: chrome.runtime.Port,
  message: AiChatStreamClientMessage,
): void => {
  if (message.type !== 'run') {
    return
  }

  const runMessage = message

  runAiChatRequest(
    {
      attachments: runMessage.attachments,
      history: runMessage.history,
      prompt: runMessage.prompt,
    },
    {
      onStepUpdate: (stepUpdate) => {
        port.postMessage({
          reasoning: stepUpdate.reasoning,
          toolTraces: stepUpdate.toolTraces,
          type: 'step',
        })
      },
    },
  )
    .then((result) => {
      port.postMessage({
        answer: result.answer,
        charts: result.charts,
        reasoning: result.reasoning,
        recordCount: result.recordCount,
        toolTraces: result.toolTraces,
        type: 'complete',
      })
    })
    .catch((error) => {
      const errorMessage: AiChatStreamErrorMessage = {
        error: error instanceof Error ? error.message : String(error),
        ollamaError: getOllamaErrorDetails(error),
        type: 'error',
      }

      port.postMessage(errorMessage)
    })
}

export { setupMessageListener }

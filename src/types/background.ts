/**
 * Background script用の型定義
 */

import type { DynamicToolUIPart } from 'ai'

import type { AiChartSpec, AiChatAttachment } from '@/features/ai-chat/types'

/**
 * ドラッグされたURL情報
 */
export interface DraggedUrlInfo {
  url: string
  timestamp: number
  processed: boolean
  timeoutId?: NodeJS.Timeout
}

/**
 * メッセージアクション型定義
 */
export type MessageAction =
  | 'urlDragStarted'
  | 'urlDropped'
  | 'removeUrlFromStorage'
  | 'removeUrlRecordsFromStorage'
  | 'calculateTimeRemaining'
  | 'checkExpiredTabs'
  | 'updateTabTimestamps'
  | 'getAlarmStatus'
  | 'listOllamaModels'
  | 'runAiChat'

/**
 * メッセージ基底型
 */
export interface BaseMessage {
  action: MessageAction
}

/**
 * URLドラッグ開始メッセージ
 */
export interface UrlDragStartedMessage extends BaseMessage {
  action: 'urlDragStarted'
  url: string
}

/**
 * URLドロップメッセージ
 */
export interface UrlDroppedMessage extends BaseMessage {
  action: 'urlDropped'
  url: string
  fromExternal?: boolean
}

/**
 * URL削除メッセージ
 */
export interface RemoveUrlMessage extends BaseMessage {
  action: 'removeUrlFromStorage'
  url: string
}

export interface RemoveUrlRecordsMessage extends BaseMessage {
  action: 'removeUrlRecordsFromStorage'
  urlIds: string[]
}

/**
 * 残り時間計算メッセージ
 */
export interface CalculateTimeRemainingMessage extends BaseMessage {
  action: 'calculateTimeRemaining'
  savedAt: number
  autoDeletePeriod: string
}

/**
 * 期限切れチェックメッセージ
 */
export interface CheckExpiredTabsMessage extends BaseMessage {
  action: 'checkExpiredTabs'
  updateTimestamps?: boolean
  period?: string
}

/**
 * タイムスタンプ更新メッセージ
 */
export interface UpdateTabTimestampsMessage extends BaseMessage {
  action: 'updateTabTimestamps'
  period?: string
}

/**
 * アラーム状態取得メッセージ
 */
export interface GetAlarmStatusMessage extends BaseMessage {
  action: 'getAlarmStatus'
}

export interface ListOllamaModelsMessage extends BaseMessage {
  action: 'listOllamaModels'
}

export interface RunAiChatMessage extends BaseMessage {
  action: 'runAiChat'
  prompt: string
  history: {
    role: 'user' | 'assistant'
    content: string
    attachments?: AiChatAttachment[]
  }[]
  attachments?: AiChatAttachment[]
}

/**
 * 全てのメッセージ型のユニオン
 */
export type BackgroundMessage =
  | UrlDragStartedMessage
  | UrlDroppedMessage
  | RemoveUrlMessage
  | RemoveUrlRecordsMessage
  | CalculateTimeRemainingMessage
  | CheckExpiredTabsMessage
  | UpdateTabTimestampsMessage
  | GetAlarmStatusMessage
  | ListOllamaModelsMessage
  | RunAiChatMessage

/**
 * レスポンス型定義
 */
export interface StatusResponse {
  status: string
  success?: boolean
  result?: unknown
  removedCount?: number
  error?: string
}

export interface TimeRemainingResponse {
  timeRemaining: number | null
  expirationTime?: number
  error?: string
}

export interface AlarmStatusResponse {
  exists: boolean
  scheduledTime?: number
}

export interface OllamaErrorDetails {
  kind: 'forbidden' | 'notInstalledOrNotRunning'
  faqUrl: string
  downloadUrl: string
  baseUrl: string
  tagsUrl: string
  allowedOrigins?: string
}

export interface OllamaModelListResponse {
  status: 'ok' | 'error'
  models?: {
    name: string
    label: string
    modifiedAt?: string
  }[]
  error?: string
  ollamaError?: OllamaErrorDetails
}

export interface AiChatToolTrace {
  toolCallId: string
  toolName: string
  title: string
  type: DynamicToolUIPart['type']
  state: DynamicToolUIPart['state']
  input: DynamicToolUIPart['input']
  output?: DynamicToolUIPart['output']
  errorText?: DynamicToolUIPart['errorText']
}

export interface AiChatResponse {
  status: 'ok' | 'error'
  answer?: string
  charts?: AiChartSpec[]
  recordCount?: number
  reasoning?: string
  toolTraces?: AiChatToolTrace[]
  error?: string
  ollamaError?: OllamaErrorDetails
}

export const AI_CHAT_STREAM_PORT_NAME = 'ai-chat-stream'

export interface RunAiChatStreamPortMessage {
  type: 'run'
  prompt: string
  history: {
    role: 'user' | 'assistant'
    content: string
    attachments?: AiChatAttachment[]
  }[]
  attachments?: AiChatAttachment[]
}

export interface AiChatStreamStepMessage {
  type: 'step'
  charts?: AiChartSpec[]
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

export interface AiChatStreamCompleteMessage {
  type: 'complete'
  answer: string
  charts?: AiChartSpec[]
  recordCount: number
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

export interface AiChatStreamErrorMessage {
  type: 'error'
  error: string
  ollamaError?: OllamaErrorDetails
}

export type AiChatStreamClientMessage = RunAiChatStreamPortMessage

export type AiChatStreamServerMessage =
  | AiChatStreamStepMessage
  | AiChatStreamCompleteMessage
  | AiChatStreamErrorMessage

/**
 * コンテキストメニューID型
 */
export type ContextMenuId =
  | 'openSavedTabs'
  | 'sepOpenSavedTabs'
  | 'saveCurrentTab'
  | 'saveAllTabs'
  | 'saveSameDomainTabs'
  | 'saveAllWindowsTabs'

/**
 * クリック動作型
 */
export type ClickBehavior =
  | 'saveCurrentTab'
  | 'saveSameDomainTabs'
  | 'saveAllWindowsTabs'
  | 'saveWindowTabs'

/**
 * 自動削除期間型
 */
export type AutoDeletePeriod =
  | 'never'
  | '30sec'
  | '1min'
  | '1hour'
  | '1day'
  | '7days'
  | '14days'
  | '30days'
  | '180days'
  | '365days'

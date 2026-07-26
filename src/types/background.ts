/**
 * Background script用の型定義
 */

import { z } from 'zod'

import type {
  AiChatAttachment,
  AiChartSpec,
  AiChatToolTrace,
  OllamaErrorDetails,
} from '@/types/ai-chat-protocol'

export type {
  AiChatAttachment,
  AiChartSpec,
  AiChatToolTrace,
  OllamaErrorDetails,
} from '@/types/ai-chat-protocol'

/**
 * ドラッグされたURL情報
 */
export type DraggedUrlInfo = {
  url: string
  timestamp: number
  processed: boolean
  timeoutId?: NodeJS.Timeout
}

const nonEmptyStringSchema = z.string().min(1)

const aiChatAttachmentSchema = z.object({
  content: z.string(),
  filename: z.string(),
  kind: z.enum(['text', 'image']),
  mediaType: z.string(),
})

const aiChatHistoryMessageSchema = z.object({
  attachments: z.array(aiChatAttachmentSchema).optional(),
  content: z.string(),
  role: z.enum(['user', 'assistant']),
})

export const backgroundMessageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('urlDragStarted'),
    groupId: z.string().optional(),
    url: nonEmptyStringSchema,
  }),
  z.object({
    action: z.literal('urlDropped'),
    fromExternal: z.boolean().optional(),
    groupId: z.string().optional(),
    url: nonEmptyStringSchema,
  }),
  z.object({
    action: z.literal('removeUrlFromStorage'),
    url: nonEmptyStringSchema,
  }),
  z.object({
    action: z.literal('removeUrlRecordsFromStorage'),
    urlIds: z.array(nonEmptyStringSchema),
  }),
  z.object({
    action: z.literal('calculateTimeRemaining'),
    autoDeletePeriod: z.string(),
    savedAt: z.number(),
  }),
  z.object({
    action: z.literal('checkExpiredTabs'),
    period: z.string().optional(),
    updateTimestamps: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('updateTabTimestamps'),
    period: z.string().optional(),
  }),
  z.object({
    action: z.literal('getAlarmStatus'),
  }),
  z.object({
    action: z.literal('listOllamaModels'),
  }),
  z.object({
    action: z.literal('runAiChat'),
    attachments: z.array(aiChatAttachmentSchema).optional(),
    history: z.array(aiChatHistoryMessageSchema),
    prompt: nonEmptyStringSchema,
  }),
])

/**
 * 全てのメッセージ型のユニオン
 */
export type BackgroundMessage = z.infer<typeof backgroundMessageSchema>

/**
 * メッセージアクション型定義
 */
export type MessageAction = BackgroundMessage['action']

export const messageActionSchema = z.custom<MessageAction>(
  (action) =>
    typeof action === 'string' &&
    backgroundMessageSchema.options.some(
      (schema) => schema.shape.action.value === action,
    ),
)

/**
 * メッセージ基底型
 */
export type BaseMessage = {
  action: MessageAction
}

/**
 * URLドラッグ開始メッセージ
 *
 * 旧 `ProjectUrlItem` / `SortableUrlItem` からは `groupId` (savedTabs の
 * グループ id) も同時に送られていたが、background handler
 * (`message-handler.ts` の `handleUrlDragStarted`) は現状 `url` だけを
 * 利用し、`groupId` は log 用途に留めていた。presentation 層との
 * typed envelope 整合のため `groupId` も必須フィールドとして公開し、
 * 既存 background handler はそのまま optional 扱いする方針
 * (issue #531)。
 */
export type UrlDragStartedMessage = Extract<
  BackgroundMessage,
  { action: 'urlDragStarted' }
>

/**
 * URLドロップメッセージ
 */
export type UrlDroppedMessage = Extract<
  BackgroundMessage,
  { action: 'urlDropped' }
>

/**
 * URL削除メッセージ
 */
export type RemoveUrlMessage = Extract<
  BackgroundMessage,
  { action: 'removeUrlFromStorage' }
>

export type RemoveUrlRecordsMessage = Extract<
  BackgroundMessage,
  { action: 'removeUrlRecordsFromStorage' }
>

/**
 * 残り時間計算メッセージ
 */
export type CalculateTimeRemainingMessage = Extract<
  BackgroundMessage,
  { action: 'calculateTimeRemaining' }
>

/**
 * 期限切れチェックメッセージ
 */
export type CheckExpiredTabsMessage = Extract<
  BackgroundMessage,
  { action: 'checkExpiredTabs' }
>

/**
 * タイムスタンプ更新メッセージ
 */
export type UpdateTabTimestampsMessage = Extract<
  BackgroundMessage,
  { action: 'updateTabTimestamps' }
>

/**
 * アラーム状態取得メッセージ
 */
export type GetAlarmStatusMessage = Extract<
  BackgroundMessage,
  { action: 'getAlarmStatus' }
>

export type ListOllamaModelsMessage = Extract<
  BackgroundMessage,
  { action: 'listOllamaModels' }
>

export type RunAiChatMessage = Extract<
  BackgroundMessage,
  { action: 'runAiChat' }
>

/**
 * レスポンス型定義
 */
export type StatusResponse = {
  status: string
  success?: boolean
  result?: unknown
  removedCount?: number
  error?: string
}

export type TimeRemainingResponse = {
  timeRemaining: number | null
  expirationTime?: number
  error?: string
}

export type AlarmStatusResponse = {
  exists: boolean
  scheduledTime?: number
}

export type OllamaModelListResponse = {
  status: 'ok' | 'error'
  models?: {
    name: string
    label: string
    modifiedAt?: string
  }[]
  error?: string
  ollamaError?: OllamaErrorDetails
}

export type AiChatResponse = {
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

export type RunAiChatStreamPortMessage = {
  type: 'run'
  prompt: string
  history: {
    role: 'user' | 'assistant'
    content: string
    attachments?: AiChatAttachment[]
  }[]
  attachments?: AiChatAttachment[]
}

export type AiChatStreamStepMessage = {
  type: 'step'
  charts?: AiChartSpec[]
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

export type AiChatStreamCompleteMessage = {
  type: 'complete'
  answer: string
  charts?: AiChartSpec[]
  recordCount: number
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

export type AiChatStreamErrorMessage = {
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

import type {
  AiChatAttachment,
  AiChartSpec,
  AiChatToolTrace,
  OllamaErrorDetails,
} from '@/types/ai-chat-protocol'

export type {
  AiChatAttachment,
  AiChartAxisFormat,
  AiChartDatum,
  AiChartSeries,
  AiChartSpec,
  AiChartType,
  AiChatToolTrace,
  OllamaErrorDetails,
} from '@/types/ai-chat-protocol'

export interface AiSavedUrlRecord {
  id: string
  url: string
  title: string
  domain: string
  savedAt: number
  savedInTabGroups: string[]
  savedInProjects: string[]
  subCategories: string[]
  projectCategories: string[]
  parentCategories: string[]
}

export type AiSavedUrlSortDirection = 'asc' | 'desc'

export interface AiSavedUrlPageOptions {
  page?: number
  pageSize?: number
  sortDirection?: AiSavedUrlSortDirection
}

export interface AiSavedUrlToolItem {
  url: string
  title: string
  domain: string
  savedAt: number
  savedInProjects: string[]
  parentCategories: string[]
}

export interface AiSavedUrlPage<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  sortDirection: AiSavedUrlSortDirection
}

export interface AiChatConversationMessage {
  attachments?: AiChatAttachment[]
  charts?: AiChartSpec[]
  content: string
  id: string
  isStreaming?: boolean
  ollamaError?: OllamaErrorDetails
  reasoning?: string
  role: 'user' | 'assistant'
  toolTraces?: AiChatToolTrace[]
}

export interface AiChatConversation {
  createdAt: number
  id: string
  messages: AiChatConversationMessage[]
  title: string
  updatedAt: number
}

export interface AiChatHistoryItem {
  id: string
  isActive: boolean
  preview: string
  title: string
}

export interface InterestEvidenceEntry {
  value: string
  count: number
}

export interface AiChatConversation {
  createdAt: number
  id: string
  messages: AiChatConversationMessage[]
  title: string
  updatedAt: number
}

export interface AiChatHistoryItem {
  id: string
  isActive: boolean
  preview: string
  title: string
}

export interface InterestInferenceResult {
  summary: string
  isTentative: boolean
  evidence: {
    topDomains: InterestEvidenceEntry[]
    topCategories: InterestEvidenceEntry[]
  }
  chartSpecs: AiChartSpec[]
}

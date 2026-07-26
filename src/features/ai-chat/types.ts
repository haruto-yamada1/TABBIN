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

export type AiSavedUrlRecord = {
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

export type AiSavedUrlPageOptions = {
  page?: number
  pageSize?: number
  sortDirection?: AiSavedUrlSortDirection
}

export type AiSavedUrlToolItem = {
  url: string
  title: string
  domain: string
  savedAt: number
  savedInProjects: string[]
  parentCategories: string[]
}

export type AiSavedUrlPage<T> = {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  sortDirection: AiSavedUrlSortDirection
}

export type AiChatConversationMessage = {
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

export type AiChatConversation = {
  createdAt: number
  id: string
  messages: AiChatConversationMessage[]
  title: string
  updatedAt: number
}

export type AiChatHistoryItem = {
  id: string
  isActive: boolean
  preview: string
  title: string
}

export type InterestEvidenceEntry = {
  value: string
  count: number
}

export type InterestInferenceResult = {
  summary: string
  isTentative: boolean
  evidence: {
    topDomains: InterestEvidenceEntry[]
    topCategories: InterestEvidenceEntry[]
  }
  chartSpecs: AiChartSpec[]
}

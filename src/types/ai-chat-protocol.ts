/**
 * AI chat と background script で共有する protocol 型定義
 *
 * import cycle を避けるため、双方が依存する型をここに集約する。
 * - src/types/background.ts からは re-export する
 * - src/features/ai-chat/types.ts からは re-export する
 */

import type { DynamicToolUIPart } from 'ai'

// --- Ollama error ---

export type OllamaErrorDetails = {
  kind: 'forbidden' | 'notInstalledOrNotRunning'
  faqUrl: string
  downloadUrl: string
  baseUrl: string
  tagsUrl: string
  allowedOrigins?: string
}

// --- AI chat attachment ---

export type AiChatAttachment = {
  filename: string
  mediaType: string
  kind: 'text' | 'image'
  content: string
}

// --- AI chart ---

export type AiChartType = 'area' | 'bar' | 'line' | 'pie' | 'radar'

export type AiChartAxisFormat = 'count' | 'date' | 'label' | 'percent'

export type AiChartSeries = {
  colorToken: string
  dataKey: string
  label: string
}

export type AiChartDatum = Record<string, number | string | null>

export type AiChartSpec = {
  type: AiChartType
  title: string
  data: AiChartDatum[]
  series: AiChartSeries[]
  categoryKey?: string
  description?: string
  emptyMessage?: string
  showLegend?: boolean
  stacked?: boolean
  valueFormat?: AiChartAxisFormat
  xKey?: string
}

// --- AI chat tool trace ---

export type AiChatToolTrace = {
  toolCallId: string
  toolName: string
  title: string
  type: DynamicToolUIPart['type']
  state: DynamicToolUIPart['state']
  input: DynamicToolUIPart['input']
  output?: DynamicToolUIPart['output']
  errorText?: DynamicToolUIPart['errorText']
}

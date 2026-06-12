import { z } from 'zod'

import type { AiChatConversation } from '@/features/ai-chat/types'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
  UserSettings,
} from '@/types/storage'

interface ImportedUrlData {
  url: string
  title?: string
  favIconUrl?: string
  timestamp?: number
  tabId?: number
  subCategory?: string
  savedAt?: number
}

interface ImportedUrlRecordData {
  id: string
  url: string
  title?: string
  savedAt?: number
  favIconUrl?: string
}

interface ImportedTabData {
  id: string
  domain: string
  urls?: ImportedUrlData[]
  urlIds?: string[]
  urlSubCategories?: Record<string, string>
  parentCategoryId?: string
  subCategories?: unknown[]
  categoryKeywords?: unknown[]
  subCategoryOrder?: unknown[]
  subCategoryOrderWithUncategorized?: unknown[]
  savedAt?: number
}

interface ImportedCustomProjectData {
  id: string
  name: string
  projectKeywords?: {
    titleKeywords?: unknown[]
    urlKeywords?: unknown[]
    domainKeywords?: unknown[]
  }
  urlIds?: string[]
  urls?: {
    url: string
    title?: string
    notes?: string
    savedAt?: number
    category?: string
  }[]
  urlMetadata?: Record<
    string,
    {
      notes?: string
      category?: string
    }
  >
  categories?: unknown[]
  categoryOrder?: unknown[]
  createdAt?: number
  updatedAt?: number
}

interface ImportedCustomProjectUrlData {
  url: string
  title?: string
  notes?: string
  savedAt?: number
  category?: string
}

interface ConvertedUrlData {
  urlIds: string[]
  urlSubCategories?: Record<string, string>
}

interface BackupData {
  version: string
  timestamp: string
  userSettings: UserSettings
  parentCategories: ParentCategory[]
  savedTabs: TabGroup[]
  aiChatConversations?: AiChatConversation[]
  activeAiChatConversationId?: string
  customProjects?: CustomProject[]
  customProjectOrder?: string[]
  savedAnalyticsViews?: SavedAnalyticsView[]
  urls?: UrlRecord[]
}

const importedUrlDataSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  favIconUrl: z.string().optional(),
  timestamp: z.number().optional(),
  tabId: z.number().optional(),
  // インポート用に他のプロパティも許可
  subCategory: z.string().optional(),
  savedAt: z.number().optional(),
})

const importedUrlRecordSchema = z.object({
  favIconUrl: z.string().optional(),
  id: z.string(),
  savedAt: z.number().optional(),
  title: z.string().optional(),
  url: z.string(),
})

const importedCustomProjectSchema = z.object({
  categories: z.array(z.unknown()).optional(),
  categoryOrder: z.array(z.unknown()).optional(),
  createdAt: z.number().optional(),
  id: z.string(),
  name: z.string(),
  projectKeywords: z
    .object({
      titleKeywords: z.array(z.unknown()).optional(),
      urlKeywords: z.array(z.unknown()).optional(),
      domainKeywords: z.array(z.unknown()).optional(),
    })
    .optional(),
  updatedAt: z.number().optional(),
  urlIds: z.array(z.string()).optional(),
  urlMetadata: z
    .record(
      z.string(),
      z.object({
        notes: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
  urls: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        notes: z.string().optional(),
        savedAt: z.number().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
})

const analyticsQuerySchema = z.object({
  chartType: z.enum(['area', 'bar', 'line', 'pie', 'radar']),
  compareBy: z.enum(['mode', 'none']),
  customDateRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  filters: z.object({
    excludedDomains: z.array(z.string()),
    excludedParentCategories: z.array(z.string()),
    excludedProjectCategories: z.array(z.string()),
    excludedProjects: z.array(z.string()),
    excludedSubCategories: z.array(z.string()),
    includedDomains: z.array(z.string()),
    includedParentCategories: z.array(z.string()),
    includedProjectCategories: z.array(z.string()),
    includedProjects: z.array(z.string()),
    includedSubCategories: z.array(z.string()),
  }),
  groupBy: z.enum([
    'domain',
    'parentCategory',
    'project',
    'projectCategory',
    'subCategory',
    'time',
    'timeRecent',
    'timeTop',
  ]),
  limit: z.number(),
  mode: z.enum(['both', 'custom', 'domain']),
  normalize: z.boolean(),
  sort: z.enum(['label-asc', 'label-desc', 'value-asc', 'value-desc']),
  stacked: z.boolean(),
  timeBucket: z.enum(['day', 'month', 'week']),
  timeRange: z.enum(['30d', '365d', '7d', '90d', 'all', 'custom']),
  title: z.string().optional(),
})

const savedAnalyticsViewSchema = z.object({
  createdAt: z.number(),
  id: z.string(),
  name: z.string(),
  query: analyticsQuerySchema,
  updatedAt: z.number(),
})

const aiChartSeriesSchema = z.object({
  colorToken: z.string(),
  dataKey: z.string(),
  label: z.string(),
})

const aiChartSpecSchema = z.object({
  categoryKey: z.string().optional(),
  data: z.array(
    z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  ),
  description: z.string().optional(),
  emptyMessage: z.string().optional(),
  series: z.array(aiChartSeriesSchema),
  showLegend: z.boolean().optional(),
  stacked: z.boolean().optional(),
  title: z.string(),
  type: z.enum(['area', 'bar', 'line', 'pie', 'radar']),
  valueFormat: z.enum(['count', 'date', 'label', 'percent']).optional(),
  xKey: z.string().optional(),
})

const aiChatAttachmentSchema = z.object({
  content: z.string(),
  filename: z.string(),
  kind: z.enum(['text', 'image']),
  mediaType: z.string(),
})

const aiChatToolTraceSchema = z.object({
  errorText: z.string().optional(),
  input: z.unknown(),
  output: z.unknown().optional(),
  state: z.string(),
  title: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.string(),
})

const ollamaErrorDetailsSchema = z.object({
  allowedOrigins: z.string().optional(),
  baseUrl: z.string(),
  downloadUrl: z.string(),
  faqUrl: z.string(),
  kind: z.enum(['forbidden', 'notInstalledOrNotRunning']),
  tagsUrl: z.string(),
})

const aiChatConversationMessageSchema = z.object({
  attachments: z.array(aiChatAttachmentSchema).optional(),
  charts: z.array(aiChartSpecSchema).optional(),
  content: z.string(),
  id: z.string(),
  isStreaming: z.boolean().optional(),
  ollamaError: ollamaErrorDetailsSchema.optional(),
  reasoning: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  toolTraces: z.array(aiChatToolTraceSchema).optional(),
})

const aiChatConversationSchema = z.object({
  createdAt: z.number(),
  id: z.string(),
  messages: z.array(aiChatConversationMessageSchema),
  title: z.string(),
  updatedAt: z.number(),
})

const backupDataSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  userSettings: z.object({
    activeAiSystemPromptId: z.string().optional(),
    aiSystemPrompts: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          template: z.string(),
          createdAt: z.number(),
          updatedAt: z.number(),
        }),
      )
      .optional(),
    autoDeletePeriod: z.string().optional(),
    clickBehavior: z.enum([
      'saveCurrentTab',
      'saveWindowTabs',
      'saveSameDomainTabs',
      'saveAllWindowsTabs',
    ]),
    enableCategories: z.boolean(),
    excludePatterns: z.array(z.string()),
    ollamaModel: z.string().optional(),
    removeTabAfterExternalDrop: z.boolean().optional(),
    removeTabAfterOpen: z.boolean(),
    showSavedTime: z.boolean(),
  }),
  parentCategories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      domains: z.array(z.string()),
      domainNames: z.array(z.string()),
      // Keywords はスキーマ上は許可するが、処理中に適切に扱う
      keywords: z.array(z.string()).optional(),
    }),
  ),
  savedTabs: z.array(
    z.object({
      id: z.string(),
      domain: z.string(),
      // 旧形式: URLsを直接保持
      urls: z.array(importedUrlDataSchema).optional(),
      // 新形式: URL ID参照
      urlIds: z.array(z.string()).optional(),
      urlSubCategories: z.record(z.string(), z.string()).optional(),
      parentCategoryId: z.string().optional(),
      subCategories: z.array(z.unknown()).optional(),
      categoryKeywords: z.array(z.unknown()).optional(),
      subCategoryOrder: z.array(z.unknown()).optional(),
      subCategoryOrderWithUncategorized: z.array(z.unknown()).optional(),
      savedAt: z.number().optional(),
    }),
  ),
  aiChatConversations: z.array(aiChatConversationSchema).optional(),
  activeAiChatConversationId: z.string().optional(),
  customProjects: z.array(importedCustomProjectSchema).optional(),
  customProjectOrder: z.array(z.string()).optional(),
  savedAnalyticsViews: z.array(savedAnalyticsViewSchema).optional(),
  // 新形式バックアップ用: URLレコード本体
  urls: z.array(importedUrlRecordSchema).optional(),
})

function parseBackupData(jsonData: string): BackupData | null {
  // eslint-disable-next-line typescript/no-unsafe-assignment
  const parsedData = JSON.parse(jsonData)
  const validationResult = backupDataSchema.safeParse(parsedData)
  if (!validationResult.success) {
    console.error('バリデーションエラー:', validationResult.error)
    return null
  }
  // OK: backupDataSchema validates subset of BackupData; import merge fills remaining fields from current settings
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return structuredClone(validationResult.data) as BackupData
}

export { backupDataSchema, parseBackupData }
export type {
  BackupData,
  ConvertedUrlData,
  ImportedCustomProjectData,
  ImportedCustomProjectUrlData,
  ImportedTabData,
  ImportedUrlData,
  ImportedUrlRecordData,
}

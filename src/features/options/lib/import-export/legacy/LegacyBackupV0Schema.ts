import { z } from 'zod'

import { isValidUrl } from '@/lib/url-filter'

const legacyImportableUrlSchema = z.string().refine(isValidUrl, {
  error: 'Invalid URL',
})

const legacyFavIconUrlSchema = legacyImportableUrlSchema.or(z.literal(''))

const legacyAiSystemPromptPresetSchema = z.strictObject({
  createdAt: z.number(),
  id: z.string().min(1),
  name: z.string().min(1),
  template: z.string(),
  updatedAt: z.number(),
})

const legacyUserSettingsSchema = z
  .strictObject({
    activeAiSystemPrompt: legacyAiSystemPromptPresetSchema.optional(),
    activeAiSystemPromptId: z.string().optional(),
    aiSystemPrompts: z.array(legacyAiSystemPromptPresetSchema).optional(),
    autoDeletePeriod: z
      .enum([
        'never',
        '30sec',
        '1min',
        '1hour',
        '1day',
        '7days',
        '14days',
        '30days',
        '180days',
        '365days',
      ])
      .optional(),
    clickBehavior: z
      .enum([
        'saveCurrentTab',
        'saveWindowTabs',
        'saveSameDomainTabs',
        'saveAllWindowsTabs',
      ])
      .optional(),
    colors: z.record(z.string(), z.string()).optional(),
    confirmDeleteAll: z.boolean().optional(),
    confirmDeleteEach: z.boolean().optional(),
    enableCategories: z.boolean().optional(),
    excludePatterns: z.array(z.string()).optional(),
    excludePinnedTabs: z.boolean().optional(),
    fontSizePercent: z.number().optional(),
    language: z.enum(['system', 'ja', 'en']).optional(),
    ollamaModel: z.string().optional(),
    openAllInNewWindow: z.boolean().optional(),
    openUrlInBackground: z.boolean().optional(),
    removeTabAfterExternalDrop: z.boolean().optional(),
    removeTabAfterOpen: z.boolean().optional(),
    showSavedTime: z.boolean().optional(),
  })
  .transform(
    ({ activeAiSystemPrompt: _activeAiSystemPrompt, ...persistableSettings }) =>
      persistableSettings,
  )

const legacyNestedUrlSchema = z.strictObject({
  favIconUrl: legacyFavIconUrlSchema.optional(),
  id: z.string().optional(),
  savedAt: z.number().optional(),
  subCategory: z.string().optional(),
  tabId: z.number().optional(),
  timestamp: z.number().optional(),
  title: z.string(),
  url: legacyImportableUrlSchema,
})

const legacyCanonicalUrlSchema = z.strictObject({
  favIconUrl: legacyFavIconUrlSchema.optional(),
  id: z.string(),
  savedAt: z.number().optional(),
  title: z.string(),
  url: legacyImportableUrlSchema,
})

const legacyCategoryKeywordSchema = z.strictObject({
  categoryName: z.string(),
  keywords: z.array(z.string()),
})

const legacySavedTabSchema = z.strictObject({
  categoryKeywords: z.array(legacyCategoryKeywordSchema).optional(),
  domain: z.string(),
  id: z.string(),
  parentCategoryId: z.string().optional(),
  savedAt: z.number().optional(),
  subCategories: z.array(z.string()).optional(),
  subCategoryOrder: z.array(z.string()).optional(),
  subCategoryOrderWithUncategorized: z.array(z.string()).optional(),
  urlIds: z.array(z.string()).optional(),
  urls: z.array(legacyNestedUrlSchema).optional(),
  urlSubCategories: z.record(z.string(), z.string()).optional(),
})

const legacyProjectKeywordsSchema = z.strictObject({
  domainKeywords: z.array(z.string()).optional(),
  titleKeywords: z.array(z.string()).optional(),
  urlKeywords: z.array(z.string()).optional(),
})

const legacyCustomProjectUrlSchema = z.strictObject({
  category: z.string().optional(),
  notes: z.string().optional(),
  savedAt: z.number().optional(),
  title: z.string(),
  url: legacyImportableUrlSchema,
})

const legacyUrlMetadataSchema = z.record(
  z.string(),
  z.strictObject({
    category: z.string().optional(),
    notes: z.string().optional(),
  }),
)

const legacyCustomProjectSchema = z.strictObject({
  categories: z.array(z.string()).optional(),
  categoryOrder: z.array(z.string()).optional(),
  createdAt: z.number().optional(),
  id: z.string(),
  name: z.string(),
  projectKeywords: legacyProjectKeywordsSchema.optional(),
  updatedAt: z.number().optional(),
  urlIds: z.array(z.string()).optional(),
  urlMetadata: legacyUrlMetadataSchema.optional(),
  urls: z.array(legacyCustomProjectUrlSchema).optional(),
})

const legacyParentCategorySchema = z.strictObject({
  domainNames: z.array(z.string()),
  domains: z.array(z.string()),
  id: z.string(),
  keywords: z.array(z.string()).optional(),
  name: z.string(),
})

const legacyAnalyticsGroupBySchema = z.preprocess(
  (value) => (value === 'time' ? 'timeRecent' : value),
  z.enum([
    'collection',
    'collectionCategory',
    'collectionGroup',
    'domain',
    'parentCategory',
    'project',
    'projectCategory',
    'subCategory',
    'timeRecent',
    'timeTop',
  ]),
)

const legacyAnalyticsFiltersSchema = z.strictObject({
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
})

const legacyAnalyticsQuerySchema = z.strictObject({
  chartType: z.enum(['area', 'bar', 'line', 'pie', 'radar']),
  collectionType: z.enum(['all', 'custom', 'domain']).optional(),
  compareBy: z.enum(['mode', 'none']),
  customDateRange: z
    .strictObject({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  filters: legacyAnalyticsFiltersSchema,
  groupBy: legacyAnalyticsGroupBySchema,
  limit: z.number(),
  metric: z.enum(['first-saved', 'last-saved', 'membership-added']).optional(),
  mode: z.enum(['both', 'custom', 'domain']),
  normalize: z.boolean(),
  schemaVersion: z.literal(2).optional(),
  sort: z.enum(['label-asc', 'label-desc', 'value-asc', 'value-desc']),
  stacked: z.boolean(),
  timeBucket: z.enum(['day', 'month', 'week']),
  timeRange: z.enum(['30d', '365d', '7d', '90d', 'all', 'custom']),
  title: z.string().optional(),
})

const legacySavedAnalyticsViewSchema = z.strictObject({
  createdAt: z.number(),
  id: z.string(),
  name: z.string(),
  query: legacyAnalyticsQuerySchema,
  updatedAt: z.number(),
})

const legacyAiChartSeriesSchema = z.strictObject({
  colorToken: z.string(),
  dataKey: z.string(),
  label: z.string(),
})

const legacyAiChartSpecSchema = z.strictObject({
  categoryKey: z.string().optional(),
  data: z.array(
    z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  ),
  description: z.string().optional(),
  emptyMessage: z.string().optional(),
  series: z.array(legacyAiChartSeriesSchema),
  showLegend: z.boolean().optional(),
  stacked: z.boolean().optional(),
  title: z.string(),
  type: z.enum(['area', 'bar', 'line', 'pie', 'radar']),
  valueFormat: z.enum(['count', 'date', 'label', 'percent']).optional(),
  xKey: z.string().optional(),
})

const legacyAiChatAttachmentSchema = z.strictObject({
  content: z.string(),
  filename: z.string(),
  kind: z.enum(['text', 'image']),
  mediaType: z.string(),
})

const legacyAiChatToolTraceSchema = z.strictObject({
  errorText: z.string().optional(),
  input: z.unknown(),
  output: z.unknown().optional(),
  state: z.enum([
    'approval-requested',
    'approval-responded',
    'input-available',
    'input-streaming',
    'output-available',
    'output-denied',
    'output-error',
  ]),
  title: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.literal('dynamic-tool'),
})

const legacyOllamaErrorDetailsSchema = z.strictObject({
  allowedOrigins: z.string().optional(),
  baseUrl: legacyImportableUrlSchema,
  downloadUrl: legacyImportableUrlSchema,
  faqUrl: legacyImportableUrlSchema,
  kind: z.enum(['forbidden', 'notInstalledOrNotRunning']),
  tagsUrl: legacyImportableUrlSchema,
})

const legacyAiChatMessageSchema = z.strictObject({
  attachments: z.array(legacyAiChatAttachmentSchema).optional(),
  charts: z.array(legacyAiChartSpecSchema).optional(),
  content: z.string(),
  id: z.string(),
  isStreaming: z.boolean().optional(),
  ollamaError: legacyOllamaErrorDetailsSchema.optional(),
  reasoning: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  toolTraces: z.array(legacyAiChatToolTraceSchema).optional(),
})

const legacyAiChatConversationSchema = z.strictObject({
  createdAt: z.number(),
  id: z.string(),
  messages: z.array(legacyAiChatMessageSchema),
  title: z.string(),
  updatedAt: z.number(),
})

export const LegacyBackupV0Schema = z.strictObject({
  activeAiChatConversationId: z.string().optional(),
  aiChatConversations: z.array(legacyAiChatConversationSchema).optional(),
  customProjectOrder: z.array(z.string()).optional(),
  customProjects: z.array(legacyCustomProjectSchema).optional(),
  parentCategories: z.array(legacyParentCategorySchema),
  savedAnalyticsViews: z.array(legacySavedAnalyticsViewSchema).optional(),
  savedTabs: z.array(legacySavedTabSchema),
  timestamp: z.iso.datetime(),
  urls: z.array(legacyCanonicalUrlSchema).optional(),
  userSettings: legacyUserSettingsSchema,
  version: z.string().min(1),
})

export type LegacyBackupV0 = z.infer<typeof LegacyBackupV0Schema>

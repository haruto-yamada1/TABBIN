import { z } from 'zod'

import {
  ACTIVE_AI_CHAT_CONVERSATION_ID_KEY,
  AI_CHAT_CONVERSATIONS_KEY,
} from '@/features/ai-chat/lib/conversation-history'
import type { AiChatConversation } from '@/features/ai-chat/types'
import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import { saveParentCategories } from '@/lib/storage/categories'
import { migrateToUrlsStorage } from '@/lib/storage/migration'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import {
  createOrUpdateUrlRecord,
  createOrUpdateUrlRecordsBatch,
} from '@/lib/storage/urls'
import type {
  CustomProject,
  ParentCategory,
  ProjectKeywordSettings,
  SubCategoryKeyword,
  TabGroup,
  UrlRecord,
  UserSettings,
} from '@/types/storage'
import { formatLocaleDateTime } from '@/utils/localDateTime'

const IMPORT_URL_RECORD_OPTIONS = {
  preserveExistingOnDuplicate: true,
} as const

// バックアップデータの型定義
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

const resolveCurrentLanguage = (settings: Pick<UserSettings, 'language'>) =>
  resolveLanguage(
    settings.language ?? 'system',
    chrome.i18n?.getUILanguage?.() ?? 'ja',
  )

const getPlaceholderUrlTitle = (
  language: UserSettings['language'] | undefined,
): string =>
  resolveCurrentLanguage({ language }) === 'en'
    ? 'Recovered data (missing original URL)'
    : '復元データ（元URL欠損）'
// インポート時のURL形式に対応するインターフェース
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
const BULK_URL_CONVERSION_THRESHOLD = 100
const CUSTOM_UNCATEGORIZED_PROJECT_ID = 'custom-uncategorized'
const getUncategorizedProjectName = (
  language: UserSettings['language'] | undefined,
) => getMessage(resolveCurrentLanguage({ language }), 'savedTabs.uncategorized')
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

const normalizeUrlKey = (url: string): string => url.trim()

const buildConvertedUrlData = (
  urls: ImportedUrlData[],
  resolveRecord: (urlData: ImportedUrlData) => UrlRecord | undefined,
): ConvertedUrlData => {
  const urlIds: string[] = []
  const urlSubCategories: Record<string, string> = {}
  for (const urlData of urls) {
    const urlRecord = resolveRecord(urlData)
    if (!urlRecord) {
      continue
    }
    urlIds.push(urlRecord.id)
    if (urlData.subCategory) {
      urlSubCategories[urlRecord.id] = urlData.subCategory
    }
  }
  return {
    urlIds,
    urlSubCategories:
      Object.keys(urlSubCategories).length > 0 ? urlSubCategories : undefined,
  }
}

const convertImportedUrlsWithPreloadedMap = (
  urls: ImportedUrlData[],
  urlRecordMapByUrl: Map<string, UrlRecord>,
): ConvertedUrlData =>
  buildConvertedUrlData(urls, (urlData) =>
    urlRecordMapByUrl.get(normalizeUrlKey(urlData.url)),
  )

// バックアップデータのバリデーションスキーマ
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

/**
 * インポートされたURLデータを新形式に変換する
 * @param urls インポートされたURL配列
 * @returns 新形式のTabGroup（urlIdsとurlSubCategoriesを含む）
 */
const convertImportedUrlsToNewFormat = async (
  urls: ImportedUrlData[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<ConvertedUrlData> => {
  if (urlRecordMapByUrl) {
    return convertImportedUrlsWithPreloadedMap(urls, urlRecordMapByUrl)
  }

  const urlRecordMapByUrlFromSingleUpdate = new Map<string, UrlRecord>()
  const urlRecordEntries = await Promise.all(
    urls.map(async (urlData) => {
      try {
        // URLレコードを作成または更新
        const urlRecord = await createOrUpdateUrlRecord(
          urlData.url,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
          urlData.title || '',
          urlData.favIconUrl,
          IMPORT_URL_RECORD_OPTIONS,
        )
        console.log(`URL変換完了: ${urlData.url} -> ${urlRecord.id}`)
        return [normalizeUrlKey(urlData.url), urlRecord] as const
      } catch (error) {
        console.error(`URL変換エラー: ${urlData.url}`, error)
        return null
      }
    }),
  )
  for (const entry of urlRecordEntries) {
    if (entry) {
      urlRecordMapByUrlFromSingleUpdate.set(entry[0], entry[1])
    }
  }
  return convertImportedUrlsWithPreloadedMap(
    urls,
    urlRecordMapByUrlFromSingleUpdate,
  )
}
/**
 * CategoryKeywordsを型安全に正規化する
 */
const normalizeCategoryKeywords = (
  keywords: unknown[] | undefined,
): SubCategoryKeyword[] => {
  if (!Array.isArray(keywords)) {
    return []
  }
  return keywords.reduce<SubCategoryKeyword[]>((items, k) => {
    if (
      !(
        typeof k === 'object' &&
        k !== null &&
        'categoryName' in k &&
        typeof k.categoryName === 'string'
      )
    ) {
      return items
    }
// eslint-disable-next-line typescript/no-unsafe-type-assertion
    const keywordData = k as {
      categoryName: string
      keywords?: unknown
    }
    items.push({
      categoryName: k.categoryName,
// eslint-disable-next-line typescript/no-unsafe-assignment
      keywords: Array.isArray(keywordData.keywords) ? keywordData.keywords : [],
    })
    return items
  }, [])
}
/**
 * サブカテゴリ配列を文字列配列に正規化する
 */
const normalizeSubCategories = (items: unknown[] | undefined): string[] => {
  if (!Array.isArray(items)) {
    return []
  }
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    let name: string | null = null
    if (typeof item === 'string') {
      name = item
    } else if (
      typeof item === 'object' &&
      item !== null &&
      'name' in item &&
      typeof item.name === 'string'
    ) {
      ;({ name } = item)
    }
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    names.push(name)
  }
  return names
}

const normalizeStringArray = (items: unknown[] | undefined): string[] => {
  if (!Array.isArray(items)) {
    return []
  }
  const values: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (typeof item !== 'string' || seen.has(item)) {
      continue
    }
    seen.add(item)
    values.push(item)
  }
  return values
}

const normalizeSubCategoryOrder = (
  items: unknown[] | undefined,
  validCategories: string[],
): string[] | undefined => {
  const validCategorySet = new Set(validCategories)
  const normalized = normalizeStringArray(items).filter((category) =>
    validCategorySet.has(category),
  )
  return normalized.length > 0 ? normalized : undefined
}

const normalizeSubCategoryOrderWithUncategorized = (
  items: unknown[] | undefined,
  validCategories: string[],
): string[] | undefined => {
  const validCategorySet = new Set(validCategories)
  const normalized = normalizeStringArray(items).filter(
    (category) =>
      category === '__uncategorized' || validCategorySet.has(category),
  )
  return normalized.length > 0 ? normalized : undefined
}

const mergeOrderedSubCategories = ({
  existingOrder,
  importedOrder,
  validCategories,
}: {
  existingOrder: unknown[] | undefined
  importedOrder: unknown[] | undefined
  validCategories: string[]
}): string[] | undefined => {
  const normalizedExisting =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    normalizeSubCategoryOrder(existingOrder, validCategories) || []
  const normalizedImported =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    normalizeSubCategoryOrder(importedOrder, validCategories) || []
  const mergedOrder = [...normalizedExisting]
  const seen = new Set(normalizedExisting)
  for (const category of normalizedImported) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  for (const category of validCategories) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  return mergedOrder.length > 0 ? mergedOrder : undefined
}

const mergeOrderedSubCategoriesWithUncategorized = ({
  existingOrder,
  importedOrder,
  validCategories,
}: {
  existingOrder: unknown[] | undefined
  importedOrder: unknown[] | undefined
  validCategories: string[]
}): string[] | undefined => {
  const normalizedExisting =
    normalizeSubCategoryOrderWithUncategorized(
      existingOrder,
      validCategories,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    ) || []
  const normalizedImported =
    normalizeSubCategoryOrderWithUncategorized(
      importedOrder,
      validCategories,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    ) || []
  const mergedOrder = [...normalizedExisting]
  const seen = new Set(normalizedExisting)
  for (const category of normalizedImported) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  for (const category of validCategories) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  return mergedOrder.length > 0 ? mergedOrder : undefined
}

const normalizeProjectKeywords = (
  projectKeywords: ImportedCustomProjectData['projectKeywords'],
): ProjectKeywordSettings => ({
  domainKeywords: normalizeStringArray(projectKeywords?.domainKeywords),
  titleKeywords: normalizeStringArray(projectKeywords?.titleKeywords),
  urlKeywords: normalizeStringArray(projectKeywords?.urlKeywords),
})

const normalizeImportedCustomProject = (
  project: ImportedCustomProjectData,
): CustomProject => {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const createdAt = project.createdAt || Date.now()
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const updatedAt = project.updatedAt || createdAt
  const urlIds = Array.isArray(project.urlIds)
    ? project.urlIds.filter((id): id is string => typeof id === 'string')
    : []
  const urls = Array.isArray(project.urls)
    ? project.urls.reduce<NonNullable<CustomProject['urls']>>((items, item) => {
        if (item?.url) {
          items.push({
            url: item.url,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
            title: item.title || '',
            notes: item.notes,
            savedAt: item.savedAt,
            category: item.category,
          })
        }
        return items
      }, [])
    : undefined
  const urlMetadata =
    project.urlMetadata &&
    typeof project.urlMetadata === 'object' &&
    !Array.isArray(project.urlMetadata)
      ? project.urlMetadata
      : undefined
  const categories = normalizeStringArray(project.categories)
  const categoryOrder = normalizeStringArray(project.categoryOrder)

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urlIds,
    ...(urls && urls.length > 0 ? { urls } : {}),
    ...(urlMetadata ? { urlMetadata } : {}),
    categories,
    ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
    createdAt,
    updatedAt,
  }
}

const buildCustomProjectUrlIdList = (tabGroups: TabGroup[]): string[] => {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  return [...new Set(tabGroups.flatMap((group) => group.urlIds || []))]
}

const stripCustomProjectUrls = (project: CustomProject): CustomProject => {
  const { urls: _urls, ...rest } = project
  return rest
}

const sanitizeCustomProjectMetadata = (
  project: CustomProject,
  urlIds: string[],
): CustomProject['urlMetadata'] | undefined => {
  if (!project.urlMetadata) {
    return undefined
  }
  const allowedIdSet = new Set(urlIds)
  const entries = Object.entries(project.urlMetadata).filter(([urlId]) =>
    allowedIdSet.has(urlId),
  )
  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries)
}

const buildSanitizedCustomProject = (
  project: CustomProject,
  urlIds: string[],
): CustomProject => {
  const { urlMetadata: _urlMetadata, ...rest } = stripCustomProjectUrls(project)
  const nextMetadata = sanitizeCustomProjectMetadata(project, urlIds)
  return {
    ...rest,
    urlIds,
    ...(nextMetadata ? { urlMetadata: nextMetadata } : {}),
  }
}

const buildUncategorizedCustomProject = (
  now: number,
  language: UserSettings['language'] | undefined,
  project?: CustomProject,
): CustomProject => {
  if (project) {
    return stripCustomProjectUrls(project)
  }
  return {
    categories: [],
    createdAt: now,
    id: CUSTOM_UNCATEGORIZED_PROJECT_ID,
    name: getUncategorizedProjectName(language),
    projectKeywords: normalizeProjectKeywords(undefined),
    updatedAt: now,
    urlIds: [],
  }
}

const alignCustomProjectsWithSavedTabs = ({
  customProjectOrder,
  customProjects,
  language,
  tabGroups,
}: {
  customProjectOrder: string[] | undefined
  customProjects: CustomProject[]
  language: UserSettings['language'] | undefined
  tabGroups: TabGroup[]
}): {
  customProjectOrder: string[]
  customProjects: CustomProject[]
} => {
  const orderedTabUrlIds = buildCustomProjectUrlIdList(tabGroups)
  const allowedUrlIdSet = new Set(orderedTabUrlIds)
  const normalizedProjects = customProjects.map((project) =>
    stripCustomProjectUrls(normalizeImportedCustomProject(project)),
  )
  const normalizedOrder = normalizeCustomProjectOrder(
    customProjectOrder,
    normalizedProjects,
  )
  const projectById = new Map(
    normalizedProjects.map((project) => [project.id, project]),
  )
  const orderedProjects = normalizedOrder.flatMap((projectId) => {
    return [projectById.get(projectId)!]
  })
  const normalizedOrderSet = new Set(normalizedOrder)
  const remainingProjects = normalizedProjects.filter(
    (project) => !normalizedOrderSet.has(project.id),
  )
  const allProjects = [...orderedProjects, ...remainingProjects]
  const assignedUrlIds = new Set<string>()
  const sanitizedProjects = allProjects.map((project) => {
    const nextUrlIds: string[] = []
    for (const urlId of project.urlIds!) {
      if (!allowedUrlIdSet.has(urlId) || assignedUrlIds.has(urlId)) {
        continue
      }
      assignedUrlIds.add(urlId)
      nextUrlIds.push(urlId)
    }
    return buildSanitizedCustomProject(project, nextUrlIds)
  })
  const missingUrlIds = orderedTabUrlIds.filter(
    (urlId) => !assignedUrlIds.has(urlId),
  )
  if (missingUrlIds.length > 0) {
    const now = Date.now()
    const uncategorizedIndex = sanitizedProjects.findIndex(
      (project) => project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID,
    )
    const uncategorizedProject = buildUncategorizedCustomProject(
      now,
      language,
      uncategorizedIndex === -1
        ? undefined
        : sanitizedProjects[uncategorizedIndex],
    )
    const uncategorizedUrlIds = uncategorizedProject.urlIds
    const urlIdSet = new Set(uncategorizedUrlIds)
    for (const urlId of missingUrlIds) {
      urlIdSet.add(urlId)
    }
    uncategorizedProject.urlIds = [...urlIdSet]
    const nextUncategorizedProject = buildSanitizedCustomProject(
      uncategorizedProject,
      [...urlIdSet],
    )
    if (uncategorizedIndex === -1) {
      sanitizedProjects.push(nextUncategorizedProject)
    } else {
      sanitizedProjects[uncategorizedIndex] = nextUncategorizedProject
    }
  }
  return {
    customProjectOrder: normalizeCustomProjectOrder(
      customProjectOrder,
      sanitizedProjects,
    ),
    customProjects: sanitizedProjects,
  }
}

// eslint-disable-next-line eslint/complexity
const convertCustomProjectToExportUrls = (
  project: CustomProject,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): NonNullable<CustomProject['urls']> => {
  if (Array.isArray(project.urls) && project.urls.length > 0) {
    return project.urls.filter(
      (item): item is NonNullable<CustomProject['urls']>[number] =>
        Boolean(item?.url),
    )
  }
  if (!Array.isArray(project.urlIds) || project.urlIds.length === 0) {
    return []
  }

  const exportedUrls: NonNullable<CustomProject['urls']> = []
  let offset = 0

  for (const urlId of project.urlIds) {
    const urlRecord =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      urlRecordMap.get(urlId) || placeholderUrlRecordMap.get(urlId)
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    const resolvedUrlRecord = urlRecord || {
      id: urlId,
      savedAt:
        typeof project.updatedAt === 'number'
          ? project.updatedAt + offset
          : Date.now() + offset,
      title: placeholderUrlTitle,
      url: `https://tabbin.invalid/#tabbin-export-custom-missing-${project.id}-${urlId}`,
    }
    if (!(urlRecord || placeholderUrlRecordMap.has(urlId))) {
      placeholderUrlRecordMap.set(urlId, resolvedUrlRecord)
    }
    offset += 1
    exportedUrls.push({
      url: resolvedUrlRecord.url,
      title: resolvedUrlRecord.title || '',
      notes: project.urlMetadata?.[urlId]?.notes,
      savedAt: resolvedUrlRecord.savedAt,
      category: project.urlMetadata?.[urlId]?.category,
    })
  }

  return exportedUrls
}

const toExportCustomProject = (
  project: CustomProject,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): CustomProject => {
  const exportUrls = convertCustomProjectToExportUrls(
    project,
    urlRecordMap,
    placeholderUrlRecordMap,
    placeholderUrlTitle,
  )

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urls: exportUrls,
    categories: [...project.categories],
    ...(project.categoryOrder && project.categoryOrder.length > 0
      ? { categoryOrder: [...project.categoryOrder] }
      : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

const normalizeCustomProjectOrder = (
  order: string[] | undefined,
  projects: CustomProject[],
): string[] => {
  const existingIds = new Set(projects.map((project) => project.id))
  const normalizedOrder = Array.isArray(order)
    ? order.filter((id) => typeof id === 'string' && existingIds.has(id))
    : []
  const normalizedOrderSet = new Set(normalizedOrder)
  const missingIds = projects.reduce<string[]>((ids, project) => {
    if (!normalizedOrderSet.has(project.id)) {
      ids.push(project.id)
    }
    return ids
  }, [])
  return [...normalizedOrder, ...missingIds]
}

const mergeImportedCustomProjects = (
  currentProjects: CustomProject[],
  currentOrder: string[],
  importedProjects: CustomProject[],
  importedOrder: string[] | undefined,
): {
  customProjects: CustomProject[]
  customProjectOrder: string[]
} => {
  const normalizedCurrentProjects = currentProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  const normalizedImportedProjects = importedProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  const currentIds = new Set(
    normalizedCurrentProjects.map((project) => project.id),
  )
  const newProjects = normalizedImportedProjects.filter(
    (project) => !currentIds.has(project.id),
  )
  const mergedProjects = [...normalizedCurrentProjects, ...newProjects]
  const normalizedCurrentOrder = normalizeCustomProjectOrder(
    currentOrder,
    normalizedCurrentProjects,
  )
  const normalizedImportedOrder = normalizeCustomProjectOrder(
    importedOrder,
    normalizedImportedProjects,
  )
  const newProjectIds = new Set(newProjects.map((project) => project.id))
  const appendedImportedIds = normalizedImportedOrder.filter((id) =>
    newProjectIds.has(id),
  )

  return {
    customProjectOrder: [...normalizedCurrentOrder, ...appendedImportedIds],
    customProjects: mergedProjects,
  }
}

const overwriteImportedCustomProjects = (
  importedProjects: CustomProject[],
  importedOrder: string[] | undefined,
): {
  customProjects: CustomProject[]
  customProjectOrder: string[]
} => {
  const customProjects = importedProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  return {
    customProjectOrder: normalizeCustomProjectOrder(
      importedOrder,
      customProjects,
    ),
    customProjects,
  }
}

const restoreImportedCustomProjectUrlsFromIds = (
  project: ImportedCustomProjectData,
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): ImportedCustomProjectUrlData[] => {
  if (!Array.isArray(project.urlIds) || project.urlIds.length === 0) {
    return []
  }

  const restoredUrls: ImportedCustomProjectUrlData[] = []
  for (const urlId of project.urlIds) {
    const urlRecord =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      importedUrlRecordMap.get(urlId) || currentUrlRecordMap.get(urlId)
    if (!urlRecord) {
      continue
    }
    restoredUrls.push({
      url: urlRecord.url,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      title: urlRecord.title || '',
      savedAt: urlRecord.savedAt,
      notes: project.urlMetadata?.[urlId]?.notes,
      category: project.urlMetadata?.[urlId]?.category,
    })
  }
  return restoredUrls
}

const normalizeImportedCustomProjectsForImport = (
  projects: ImportedCustomProjectData[] | undefined,
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): (ImportedCustomProjectData & { urls: ImportedCustomProjectUrlData[] })[] => {
  if (!Array.isArray(projects)) {
    return []
  }

  return projects.map((project) => {
    if (Array.isArray(project.urls)) {
      return {
        ...project,
        urls: project.urls.filter(
          (item): item is ImportedCustomProjectUrlData => Boolean(item?.url),
        ),
      }
    }

    return {
      ...project,
      urls: restoreImportedCustomProjectUrlsFromIds(
        project,
        importedUrlRecordMap,
        currentUrlRecordMap,
      ),
    }
  })
}

const convertImportedCustomProjectUrlsToStorage = async (
  urls: ImportedCustomProjectUrlData[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<{
  urlIds: string[]
  urlMetadata?: CustomProject['urlMetadata']
}> => {
  const convertedUrls = await Promise.all(
    urls.map(async (urlData) => {
      try {
        const normalizedUrl = normalizeUrlKey(urlData.url)
        const preloadedUrlRecord = urlRecordMapByUrl?.get(normalizedUrl)
        const urlRecord =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
          preloadedUrlRecord ||
          (await createOrUpdateUrlRecord(
            urlData.url,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
            urlData.title || '',
            undefined,
            IMPORT_URL_RECORD_OPTIONS,
          ))
        return {
          id: urlRecord.id,
          metadata:
            urlData.notes || urlData.category
              ? {
                  ...(urlData.notes ? { notes: urlData.notes } : {}),
                  ...(urlData.category ? { category: urlData.category } : {}),
                }
              : undefined,
        }
      } catch (error) {
        console.error(
          `カスタムプロジェクトURL変換エラー: ${urlData.url}`,
          error,
        )
        return null
      }
    }),
  )
  const urlIds: string[] = []
  const urlMetadata: NonNullable<CustomProject['urlMetadata']> = {}
  for (const convertedUrl of convertedUrls) {
    if (!convertedUrl) {
      continue
    }
    urlIds.push(convertedUrl.id)
    if (convertedUrl.metadata) {
      urlMetadata[convertedUrl.id] = convertedUrl.metadata
    }
  }

  return {
    urlIds,
    urlMetadata: Object.keys(urlMetadata).length > 0 ? urlMetadata : undefined,
  }
}

const resolveImportedCustomProject = async (
  project: ImportedCustomProjectData & {
    urls: ImportedCustomProjectUrlData[]
  },
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<CustomProject> => {
  const categoryOrder = normalizeStringArray(project.categoryOrder)

  if (project.urls.length === 0 && Array.isArray(project.urlIds)) {
    return {
      ...normalizeImportedCustomProject(project),
      ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
    }
  }

  const convertedUrlData = await convertImportedCustomProjectUrlsToStorage(
    project.urls,
    urlRecordMapByUrl,
  )

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urlIds: convertedUrlData.urlIds,
    ...(convertedUrlData.urlMetadata
      ? { urlMetadata: convertedUrlData.urlMetadata }
      : {}),
    categories: normalizeStringArray(project.categories),
    ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    createdAt: project.createdAt || Date.now(),
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    updatedAt: project.updatedAt || project.createdAt || Date.now(),
  }
}

const resolveImportedCustomProjects = async (
  projects: (ImportedCustomProjectData & {
    urls: ImportedCustomProjectUrlData[]
  })[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<CustomProject[]> =>
  Promise.all(
    projects.map((project) =>
      resolveImportedCustomProject(project, urlRecordMapByUrl),
    ),
  )
/**
 * CategoryKeywordsをカテゴリ名単位でマージする
 */
const mergeCategoryKeywords = (
  existing: SubCategoryKeyword[] | undefined,
  imported: unknown[] | undefined,
): SubCategoryKeyword[] => {
  const keywordMap = new Map<string, SubCategoryKeyword>()
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  for (const keyword of existing || []) {
    keywordMap.set(keyword.categoryName, keyword)
  }
  for (const keyword of normalizeCategoryKeywords(imported)) {
    const existingKeyword = keywordMap.get(keyword.categoryName)
    if (!existingKeyword) {
      keywordMap.set(keyword.categoryName, keyword)
      continue
    }
    keywordMap.set(keyword.categoryName, {
      categoryName: keyword.categoryName,
      keywords: [
        ...new Set([...existingKeyword.keywords, ...keyword.keywords]),
      ],
    })
  }
  return [...keywordMap.values()]
}
/**
 * サブカテゴリを順序を保ってマージする（既存優先）
 */
const mergeSubCategories = (
  existing: unknown[] | undefined,
  imported: unknown[] | undefined,
): string[] => {
  const existingNames = normalizeSubCategories(existing)
  const merged = [...existingNames]
  const seen = new Set(existingNames)
  for (const name of normalizeSubCategories(imported)) {
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    merged.push(name)
  }
  return merged
}
/**
 * URL参照情報（urlIds/urlSubCategories）をマージする
 */
const mergeUrlData = (
  existingTab: TabGroup,
  importedUrlData: ConvertedUrlData,
): ConvertedUrlData => {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const urlIdSet = new Set(existingTab.urlIds || [])
  for (const urlId of importedUrlData.urlIds) {
    urlIdSet.add(urlId)
  }
  const mergedUrlSubCategories = {
    ...existingTab.urlSubCategories,
    ...importedUrlData.urlSubCategories,
  }
  return {
    urlIds: [...urlIdSet],
    urlSubCategories:
      Object.keys(mergedUrlSubCategories).length > 0
        ? mergedUrlSubCategories
        : undefined,
  }
}
/**
 * TabGroupのURL情報をエクスポート用の旧形式配列に変換する
 */
// eslint-disable-next-line eslint/complexity
const convertTabGroupToExportUrls = (
  tab: TabGroup,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): NonNullable<TabGroup['urls']> => {
  if (Array.isArray(tab.urls) && tab.urls.length > 0) {
    return tab.urls.filter(
      (item): item is NonNullable<TabGroup['urls']>[number] =>
        Boolean(item?.url),
    )
  }
  if (!Array.isArray(tab.urlIds) || tab.urlIds.length === 0) {
    return []
  }
  const exportedUrls: NonNullable<TabGroup['urls']> = []
  const baseDomain = tab.domain.replace(/\/+$/, '')
  let offset = 0
  for (const urlId of tab.urlIds) {
    const urlRecord =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      urlRecordMap.get(urlId) || placeholderUrlRecordMap.get(urlId)
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    const resolvedUrlRecord = urlRecord || {
      id: urlId,
      savedAt:
        typeof tab.savedAt === 'number'
          ? tab.savedAt + offset
          : Date.now() + offset,
      title: placeholderUrlTitle,
      url: `${baseDomain}/#tabbin-export-missing-${urlId}`,
    }
    if (!(urlRecord || placeholderUrlRecordMap.has(urlId))) {
      placeholderUrlRecordMap.set(urlId, resolvedUrlRecord)
    }
    offset += 1
    exportedUrls.push({
      savedAt: resolvedUrlRecord.savedAt,
      subCategory: tab.urlSubCategories?.[urlId],
      title: resolvedUrlRecord.title || '',
      url: resolvedUrlRecord.url,
    })
  }
  return exportedUrls
}
/**
 * UrlIds形式のタブデータをURL配列に復元する
 */
const restoreImportedUrlsFromIds = (
  tab: ImportedTabData,
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): ImportedUrlData[] => {
  if (!Array.isArray(tab.urlIds) || tab.urlIds.length === 0) {
    return []
  }
  const restoredUrls: ImportedUrlData[] = []
  for (const urlId of tab.urlIds) {
    const urlRecord =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      importedUrlRecordMap.get(urlId) || currentUrlRecordMap.get(urlId)
    if (!urlRecord) {
      continue
    }
    restoredUrls.push({
      favIconUrl: urlRecord.favIconUrl,
      savedAt: urlRecord.savedAt,
      subCategory: tab.urlSubCategories?.[urlId],
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      title: urlRecord.title || '',
      url: urlRecord.url,
    })
  }
  return restoredUrls
}
const normalizeImportedTabsForImport = (
  importedTabs: ImportedTabData[],
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): {
  normalizedImportedTabs: (ImportedTabData & {
    urls: ImportedUrlData[]
  })[]
  unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[]
} => {
  const unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[] = []
  const normalizedImportedTabs: (ImportedTabData & {
    urls: ImportedUrlData[]
  })[] = importedTabs.map((tab) => {
    if (Array.isArray(tab.urls)) {
      return {
        ...tab,
        urls: tab.urls,
      }
    }
    const restoredUrls = restoreImportedUrlsFromIds(
      tab,
      importedUrlRecordMap,
      currentUrlRecordMap,
    )
    if (
      Array.isArray(tab.urlIds) &&
      tab.urlIds.length > 0 &&
      restoredUrls.length === 0
    ) {
      unresolvedTabs.push({
        domain: tab.domain,
        savedAt: tab.savedAt,
        urlIds: Array.from(new Set(tab.urlIds)),
      })
    }
    return {
      ...tab,
      urls: restoredUrls,
    }
  })
  return {
    normalizedImportedTabs,
    unresolvedTabs,
  }
}
/**
 * 変換結果が空のときは、インポート元のurlIdsをそのまま保持して復元性を高める
 */
const resolveUrlDataForStorage = (
  tab: ImportedTabData & {
    urls: ImportedUrlData[]
  },
  convertedUrlData: {
    urlIds: string[]
    urlSubCategories?: Record<string, string>
  },
): {
  urlIds: string[]
  urlSubCategories?: Record<string, string>
} => {
  if (convertedUrlData.urlIds.length > 0) {
    return convertedUrlData
  }
  if (
    tab.urls.length > 0 ||
    !Array.isArray(tab.urlIds) ||
    tab.urlIds.length === 0
  ) {
    return convertedUrlData
  }
  const rawUrlIds = [...new Set(tab.urlIds)]
  const rawSubCategories = tab.urlSubCategories
    ? Object.fromEntries(
        Object.entries(tab.urlSubCategories).filter(([urlId]) =>
          rawUrlIds.includes(urlId),
        ),
      )
    : undefined
  return {
    urlIds: rawUrlIds,
    urlSubCategories:
      rawSubCategories && Object.keys(rawSubCategories).length > 0
        ? rawSubCategories
        : undefined,
  }
}
/**
 * バックアップ内にURL実体が無いurlIdsに対して、代替URLレコードを生成する
 */
const ensurePlaceholderUrlRecords = async (
  unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[],
  placeholderUrlTitle: string,
): Promise<number> => {
  if (unresolvedTabs.length === 0) {
    return 0
  }
  const urlsData = await chrome.storage.local.get({
    urls: [],
  })
// eslint-disable-next-line typescript/no-unsafe-assignment
  const currentUrlRecords: UrlRecord[] = Array.isArray(urlsData.urls)
    ? urlsData.urls
    : []
  const existingIdSet = new Set(currentUrlRecords.map((record) => record.id))
  const newRecords: UrlRecord[] = []
  let offset = 0
  for (const tab of unresolvedTabs) {
    const baseDomain = tab.domain.replace(/\/+$/, '')
    for (const urlId of tab.urlIds) {
      if (existingIdSet.has(urlId)) {
        continue
      }
      existingIdSet.add(urlId)
      newRecords.push({
        id: urlId,
        // 元URLが欠損しているため、ドメインに一意アンカーを付けて代替URLを生成
        url: `${baseDomain}/#tabbin-restored-${urlId}`,
        title: placeholderUrlTitle,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        savedAt: tab.savedAt || Date.now() + offset,
      })
      offset += 1
    }
  }
  if (newRecords.length === 0) {
    return 0
  }
  await chrome.storage.local.set({
    urls: [...currentUrlRecords, ...newRecords],
  })
  return newRecords.length
}
/**
 * 現在の設定とタブデータをエクスポートする
 * @returns エクスポートされたデータを含むJSONオブジェクト
 */
// eslint-disable-next-line eslint/complexity
const exportSettings = async (): Promise<BackupData> => {
  try {
    // 先にマイグレーションを実行し、新形式URLデータの整合性を高める
    await migrateToUrlsStorage()
    const [userSettings, storageData] = await Promise.all([
      getUserSettings(),
      chrome.storage.local.get({
        [ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]: '',
        [AI_CHAT_CONVERSATIONS_KEY]: [],
        customProjectOrder: [],
        customProjects: [],
        parentCategories: [],
        savedAnalyticsViews: [],
        savedTabs: [],
        urls: [],
      }),
    ])
// eslint-disable-next-line typescript/no-unsafe-assignment
    const parentCategories: ParentCategory[] = Array.isArray(
      storageData.parentCategories,
    )
      ? storageData.parentCategories
      : []
// eslint-disable-next-line typescript/no-unsafe-assignment
    const savedTabs: TabGroup[] = Array.isArray(storageData.savedTabs)
      ? storageData.savedTabs
      : []
    const storedCustomProjects: CustomProject[] = Array.isArray(
      storageData.customProjects,
    )
      ? storageData.customProjects.map((project) =>
          normalizeImportedCustomProject(project),
        )
      : []
    const customProjectOrder = Array.isArray(storageData.customProjectOrder)
      ? storageData.customProjectOrder.filter(
          (id): id is string => typeof id === 'string',
        )
      : []
// eslint-disable-next-line typescript/no-unsafe-assignment
    const aiChatConversations: AiChatConversation[] = Array.isArray(
      storageData[AI_CHAT_CONVERSATIONS_KEY],
    )
      ? storageData[AI_CHAT_CONVERSATIONS_KEY]
      : []
    const activeAiChatConversationId =
      typeof storageData[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY] === 'string'
        ? storageData[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]
        : ''
// eslint-disable-next-line typescript/no-unsafe-assignment
    const savedAnalyticsViews: SavedAnalyticsView[] = Array.isArray(
      storageData.savedAnalyticsViews,
    )
      ? storageData.savedAnalyticsViews
      : []
// eslint-disable-next-line typescript/no-unsafe-assignment
    const urlRecords: UrlRecord[] = Array.isArray(storageData.urls)
      ? storageData.urls
      : []
    const urlRecordMap = new Map(
      urlRecords.map((urlRecord) => [urlRecord.id, urlRecord]),
    )
    const placeholderUrlRecordMap = new Map<string, UrlRecord>()
    const placeholderUrlTitle = getPlaceholderUrlTitle(
      resolveCurrentLanguage(userSettings),
    )
    const normalizedSavedTabs: TabGroup[] = savedTabs.map((tab) => ({
      ...tab,
      urls: convertTabGroupToExportUrls(
        tab,
        urlRecordMap,
        placeholderUrlRecordMap,
        placeholderUrlTitle,
      ),
    }))
    const customProjects = storedCustomProjects.map((project) =>
      toExportCustomProject(
        project,
        urlRecordMap,
        placeholderUrlRecordMap,
        placeholderUrlTitle,
      ),
    )
    const mergedUrlRecordMap = new Map(urlRecordMap)
    for (const [id, urlRecord] of placeholderUrlRecordMap) {
      if (!mergedUrlRecordMap.has(id)) {
        mergedUrlRecordMap.set(id, urlRecord)
      }
    }
    const exportUrlRecords = [...mergedUrlRecordMap.values()]
    if (placeholderUrlRecordMap.size > 0) {
      console.warn(
        `エクスポート補完: ${placeholderUrlRecordMap.size}件の欠損URLに代替URLを付与`,
      )
    }

    // バックアップデータを作成
    const backupData: BackupData = {
      activeAiChatConversationId,
      aiChatConversations,
      customProjectOrder: normalizeCustomProjectOrder(
        customProjectOrder,
        customProjects,
      ),
      customProjects,
      parentCategories,
      savedAnalyticsViews,
      savedTabs: normalizedSavedTabs,
      timestamp: new Date().toISOString(),
      urls: exportUrlRecords,
      userSettings,
      version: chrome.runtime.getManifest().version || '1.0.0',
    }
    return backupData
  } catch (error) {
    console.error('エクスポート中にエラーが発生しました:', error)
    throw new Error('データのエクスポート中にエラーが発生しました', {
      cause: error,
    })
  }
}

/**
 * データをJSONとしてダウンロードする
 * @param data ダウンロードするデータ
 * @param filename ファイル名
 */
const downloadAsJson = (data: BackupData, filename: string): void => {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()

  // クリーンアップ
  requestAnimationFrame(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })
}

/**
 * インポートされたJSONデータをバリデーションして適用する
 * @param jsonData インポートされたJSONデータ
 * @param mergeData 既存データとマージするかどうか
 * @returns インポート結果（成功/エラー）
 */
interface ImportResult {
  success: boolean
  message: string
}
type Translate = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string
type NormalizedImportResult = ReturnType<typeof normalizeImportedTabsForImport>
type NormalizedImportedTab =
  NormalizedImportResult['normalizedImportedTabs'][number]
type UnresolvedImportTab = NormalizedImportResult['unresolvedTabs'][number]
const parseBackupData = (jsonData: string): BackupData | null => {
// eslint-disable-next-line typescript/no-unsafe-assignment
  const parsedData = JSON.parse(jsonData)
  const validationResult = backupDataSchema.safeParse(parsedData)
  if (!validationResult.success) {
    console.error('バリデーションエラー:', validationResult.error)
    return null
  }
// eslint-disable-next-line typescript/no-unsafe-type-assertion
  return validationResult.data as BackupData
}
const createImportedUrlRecordMap = (
  importedData: BackupData,
): Map<string, ImportedUrlRecordData> =>
  new Map(
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    (importedData.urls || []).map((urlRecord) => [urlRecord.id, urlRecord]),
  )
const createCurrentUrlRecordMap = async (): Promise<Map<string, UrlRecord>> => {
  const currentUrlsData = await chrome.storage.local.get({
    urls: [],
  })
// eslint-disable-next-line typescript/no-unsafe-assignment
  const currentUrlRecords: UrlRecord[] = Array.isArray(currentUrlsData.urls)
    ? currentUrlsData.urls
    : []
  return new Map(
    currentUrlRecords.map((urlRecord) => [urlRecord.id, urlRecord]),
  )
}
const mergeUserSettings = (
  currentSettings: UserSettings,
  importedSettings: UserSettings,
): UserSettings => ({
  ...currentSettings,
  ...importedSettings,
  excludePatterns: [
    ...new Set([
      ...currentSettings.excludePatterns,
      ...importedSettings.excludePatterns,
    ]),
  ],
})
const normalizeImportedCategory = (
  category: ParentCategory,
): ParentCategory => {
  const { keywords: _keywords, ...rest } = category as ParentCategory & {
    keywords?: string[]
  }
  return rest
}
const mergeParentCategoriesData = (
  currentCategories: ParentCategory[],
  importedCategories: ParentCategory[],
): ParentCategory[] => {
  const categoryMap = new Map<string, ParentCategory>()
  for (const category of currentCategories) {
    categoryMap.set(category.id, category)
  }
  for (const importedCategory of importedCategories) {
    const existing = categoryMap.get(importedCategory.id)
    if (!existing) {
      categoryMap.set(
        importedCategory.id,
        normalizeImportedCategory(importedCategory),
      )
      continue
    }
    categoryMap.set(importedCategory.id, {
      ...existing,
      domainNames: [
        ...new Set([...existing.domainNames, ...importedCategory.domainNames]),
      ],
      domains: [...new Set([...existing.domains, ...importedCategory.domains])],
      name: importedCategory.name,
    })
  }
  return [...categoryMap.values()]
}
const resolveImportedTabUrlData = async (
  importedTab: NormalizedImportedTab,
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<ConvertedUrlData> => {
  const convertedUrlData = await convertImportedUrlsToNewFormat(
    importedTab.urls,
    urlRecordMapByUrl,
  )
  return resolveUrlDataForStorage(importedTab, convertedUrlData)
}
const resolveMergedSavedAt = (
  existingSavedAt?: number,
  importedSavedAt?: number,
): number | undefined => {
  if (existingSavedAt && importedSavedAt) {
    return Math.min(existingSavedAt, importedSavedAt)
  }
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  return existingSavedAt || importedSavedAt
}
const buildMergedExistingDomainTab = async (
  existingTab: TabGroup,
  importedTab: NormalizedImportedTab,
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<TabGroup> => {
  const resolvedUrlData = await resolveImportedTabUrlData(
    importedTab,
    urlRecordMapByUrl,
  )
  const mergedUrlData = mergeUrlData(existingTab, resolvedUrlData)
  const mergedKeywords = mergeCategoryKeywords(
    existingTab.categoryKeywords,
    importedTab.categoryKeywords,
  )
  const mergedSubCategories = mergeSubCategories(
    existingTab.subCategories,
    importedTab.subCategories,
  )
  const mergedSubCategoryOrder = mergeOrderedSubCategories({
    existingOrder: existingTab.subCategoryOrder,
    importedOrder: importedTab.subCategoryOrder,
    validCategories: mergedSubCategories,
  })
  const mergedSubCategoryOrderWithUncategorized =
    mergeOrderedSubCategoriesWithUncategorized({
      existingOrder: existingTab.subCategoryOrderWithUncategorized,
      importedOrder: importedTab.subCategoryOrderWithUncategorized,
      validCategories: mergedSubCategories,
    })
  return {
    id: existingTab.id,
    domain: existingTab.domain,
    urlIds: mergedUrlData.urlIds,
    urlSubCategories: mergedUrlData.urlSubCategories,
    parentCategoryId:
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      importedTab.parentCategoryId || existingTab.parentCategoryId,
    categoryKeywords: mergedKeywords,
    subCategories: mergedSubCategories,
    ...(mergedSubCategoryOrder
      ? { subCategoryOrder: mergedSubCategoryOrder }
      : {}),
    ...(mergedSubCategoryOrderWithUncategorized
      ? {
          subCategoryOrderWithUncategorized:
            mergedSubCategoryOrderWithUncategorized,
        }
      : {}),
    savedAt: resolveMergedSavedAt(existingTab.savedAt, importedTab.savedAt),
  }
}
const buildMergedNewDomainTab = async (
  importedTab: NormalizedImportedTab,
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<TabGroup> => {
  const resolvedUrlData = await resolveImportedTabUrlData(
    importedTab,
    urlRecordMapByUrl,
  )
  const normalizedKeywords = normalizeCategoryKeywords(
    importedTab.categoryKeywords,
  )
  const normalizedSubCategories = normalizeSubCategories(
    importedTab.subCategories,
  )
  const normalizedSubCategoryOrder = normalizeSubCategoryOrder(
    importedTab.subCategoryOrder,
    normalizedSubCategories,
  )
  const normalizedSubCategoryOrderWithUncategorized =
    normalizeSubCategoryOrderWithUncategorized(
      importedTab.subCategoryOrderWithUncategorized,
      normalizedSubCategories,
    )
  return {
    id: importedTab.id,
    domain: importedTab.domain,
    urlIds: resolvedUrlData.urlIds,
    urlSubCategories: resolvedUrlData.urlSubCategories,
    parentCategoryId: importedTab.parentCategoryId,
    categoryKeywords: normalizedKeywords,
    subCategories: normalizedSubCategories,
    ...(normalizedSubCategoryOrder
      ? { subCategoryOrder: normalizedSubCategoryOrder }
      : {}),
    ...(normalizedSubCategoryOrderWithUncategorized
      ? {
          subCategoryOrderWithUncategorized:
            normalizedSubCategoryOrderWithUncategorized,
        }
      : {}),
    savedAt: importedTab.savedAt,
  }
}
const mergeTabsByDomain = async (
  currentTabs: TabGroup[],
  normalizedImportedTabs: NormalizedImportedTab[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<TabGroup[]> => {
  const tabMapByDomain = new Map<string, TabGroup>()
  for (const tab of currentTabs) {
    tabMapByDomain.set(tab.domain, tab)
  }
  const mergedImportedTabs = await Promise.all(
    normalizedImportedTabs.map(async (importedTab) => {
      const existingTab = tabMapByDomain.get(importedTab.domain)
      if (existingTab) {
        console.log(`マージ処理: 既存ドメイン ${importedTab.domain}`)
        return {
          domain: importedTab.domain,
          tab: await buildMergedExistingDomainTab(
            existingTab,
            importedTab,
            urlRecordMapByUrl,
          ),
        }
      }
      console.log(`マージ処理: 新規ドメイン ${importedTab.domain}`)
      return {
        domain: importedTab.domain,
        tab: await buildMergedNewDomainTab(importedTab, urlRecordMapByUrl),
      }
    }),
  )
  for (const { domain, tab } of mergedImportedTabs) {
    tabMapByDomain.set(domain, tab)
  }
  return [...tabMapByDomain.values()]
}
const buildOverwriteTabs = async (
  normalizedImportedTabs: NormalizedImportedTab[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<TabGroup[]> =>
  Promise.all(
    normalizedImportedTabs.map(async (importedTab) => {
      console.log(`上書きモード: ${importedTab.domain} を新形式に変換中...`)
      return buildMergedNewDomainTab(importedTab, urlRecordMapByUrl)
    }),
  )
const createUnresolvedWarning = async (
  unresolvedTabs: UnresolvedImportTab[],
  translate?: Translate,
): Promise<string> => {
  if (unresolvedTabs.length === 0) {
    return ''
  }
  const placeholderUrlTitle = translate
    ? translate('options.importExport.placeholderUrlTitle')
    : getPlaceholderUrlTitle(resolveCurrentLanguage(await getUserSettings()))
  const placeholderCount = await ensurePlaceholderUrlRecords(
    unresolvedTabs,
    placeholderUrlTitle,
  )
  return translate
    ? translate('options.importExport.unresolvedWarning', undefined, {
        count: String(unresolvedTabs.length),
        placeholderCount: String(placeholderCount),
      })
    : ''
}
const countAddedCategories = (
  importedCategories: ParentCategory[],
  currentCategories: ParentCategory[],
): number =>
  importedCategories.filter(
    (imported) =>
      !currentCategories.some((current) => current.id === imported.id),
  ).length
const countAddedDomains = (
  normalizedImportedTabs: NormalizedImportedTab[],
  currentTabs: TabGroup[],
): number => {
  const currentDomains = new Set(currentTabs.map((tab) => tab.domain))
  return normalizedImportedTabs.filter((tab) => !currentDomains.has(tab.domain))
    .length
}
const buildBulkUrlRecordMap = async (
  normalizedImportedTabs: NormalizedImportedTab[],
  normalizedImportedCustomProjects: (ImportedCustomProjectData & {
    urls: ImportedCustomProjectUrlData[]
  })[],
): Promise<Map<string, UrlRecord> | undefined> => {
  const importedUrlItems = [
    ...normalizedImportedTabs.flatMap((tab) =>
      tab.urls.map((urlData) => ({
        favIconUrl: urlData.favIconUrl,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        title: urlData.title || '',
        url: normalizeUrlKey(urlData.url),
      })),
    ),
    ...normalizedImportedCustomProjects.flatMap((project) =>
      project.urls.map((urlData) => ({
        url: normalizeUrlKey(urlData.url),
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        title: urlData.title || '',
      })),
    ),
  ]
  const shouldBatchCustomProjectUrls = normalizedImportedCustomProjects.some(
    (project) => project.urls.length > 0,
  )
  if (
    !shouldBatchCustomProjectUrls &&
    importedUrlItems.length < BULK_URL_CONVERSION_THRESHOLD
  ) {
    return undefined
  }
  console.log(`インポートURLを一括変換します: ${importedUrlItems.length}件`)
  return createOrUpdateUrlRecordsBatch(
    importedUrlItems,
    IMPORT_URL_RECORD_OPTIONS,
  )
}
const shouldImportCustomProjects = (importedData: BackupData): boolean =>
  Array.isArray(importedData.customProjects)
const shouldImportAiChatHistory = (importedData: BackupData): boolean =>
  Array.isArray(importedData.aiChatConversations) ||
  typeof importedData.activeAiChatConversationId === 'string'
const shouldImportSavedAnalyticsViews = (importedData: BackupData): boolean =>
  Array.isArray(importedData.savedAnalyticsViews)
const mergeAiChatConversations = (
  currentConversations: AiChatConversation[],
  importedConversations: AiChatConversation[],
): AiChatConversation[] => {
  const conversationMap = new Map(
    currentConversations.map((conversation) => [conversation.id, conversation]),
  )

  for (const importedConversation of importedConversations) {
    conversationMap.set(importedConversation.id, importedConversation)
  }

  return [...conversationMap.values()]
}
const resolveAiChatActiveConversationId = ({
  conversations,
  fallbackId,
  importedActiveConversationId,
}: {
  conversations: AiChatConversation[]
  fallbackId?: string
  importedActiveConversationId?: string
}): string => {
  if (
    typeof importedActiveConversationId === 'string' &&
    conversations.some(
      (conversation) => conversation.id === importedActiveConversationId,
    )
  ) {
    return importedActiveConversationId
  }

  if (
    typeof fallbackId === 'string' &&
    conversations.some((conversation) => conversation.id === fallbackId)
  ) {
    return fallbackId
  }

  return conversations[0]?.id || ''
}
const resolveMergedAiChatHistory = ({
  currentActiveConversationId,
  currentConversations,
  importedData,
}: {
  currentActiveConversationId: string
  currentConversations: AiChatConversation[]
  importedData: BackupData
}):
  | {
      activeConversationId: string
      conversations: AiChatConversation[]
    }
  | undefined => {
  if (!shouldImportAiChatHistory(importedData)) {
    return undefined
  }

  const conversations = mergeAiChatConversations(
    currentConversations,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    importedData.aiChatConversations || [],
  )

  return {
    activeConversationId: resolveAiChatActiveConversationId({
      conversations,
      fallbackId: currentActiveConversationId,
      importedActiveConversationId: importedData.activeAiChatConversationId,
    }),
    conversations,
  }
}
const resolveOverwriteAiChatHistory = (
  importedData: BackupData,
):
  | {
      activeConversationId: string
      conversations: AiChatConversation[]
    }
  | undefined => {
  if (!shouldImportAiChatHistory(importedData)) {
    return undefined
  }

// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const conversations = importedData.aiChatConversations || []

  return {
    activeConversationId: resolveAiChatActiveConversationId({
      conversations,
      importedActiveConversationId: importedData.activeAiChatConversationId,
    }),
    conversations,
  }
}
const mergeSavedAnalyticsViews = (
  currentViews: SavedAnalyticsView[],
  importedViews: SavedAnalyticsView[],
): SavedAnalyticsView[] => {
  const viewMap = new Map(currentViews.map((view) => [view.id, view]))

  for (const importedView of importedViews) {
    viewMap.set(importedView.id, importedView)
  }

  return [...viewMap.values()]
}
interface ImportExecutionParams {
  importedData: BackupData
  normalizedImportedTabs: NormalizedImportedTab[]
  unresolvedTabs: UnresolvedImportTab[]
  resolvedImportedCustomProjects: CustomProject[]
  bulkUrlRecordMap?: Map<string, UrlRecord>
}
// eslint-disable-next-line eslint/complexity
const importWithMerge = async ({
  importedData,
  normalizedImportedTabs,
  unresolvedTabs,
  resolvedImportedCustomProjects,
  bulkUrlRecordMap,
  translate,
}: ImportExecutionParams & {
  translate?: Translate
}): Promise<ImportResult> => {
  const [currentSettings, storageData] = await Promise.all([
    getUserSettings(),
    chrome.storage.local.get<{
      activeAiChatConversationId?: string
// eslint-disable-next-line typescript/consistent-type-imports
      aiChatConversations?: import('@/features/ai-chat/types').AiChatConversation[]
      customProjectOrder?: string[]
      customProjects?: CustomProject[]
      parentCategories?: ParentCategory[]
// eslint-disable-next-line typescript/consistent-type-imports
      savedAnalyticsViews?: import('@/lib/storage/analytics').SavedAnalyticsView[]
      savedTabs?: TabGroup[]
    }>([
      ACTIVE_AI_CHAT_CONVERSATION_ID_KEY,
      AI_CHAT_CONVERSATIONS_KEY,
      'customProjectOrder',
      'customProjects',
      'parentCategories',
      'savedAnalyticsViews',
      'savedTabs',
    ]),
  ])
  const currentCategories: ParentCategory[] = Array.isArray(
    storageData.parentCategories,
  )
    ? storageData.parentCategories
    : []
  const currentTabs: TabGroup[] = Array.isArray(storageData.savedTabs)
    ? storageData.savedTabs
    : []
  const currentCustomProjects: CustomProject[] = Array.isArray(
    storageData.customProjects,
  )
    ? storageData.customProjects.map((project) =>
        normalizeImportedCustomProject(project),
      )
    : []
  const currentCustomProjectOrder: string[] = Array.isArray(
    storageData.customProjectOrder,
  )
    ? storageData.customProjectOrder.filter(
        (id): id is string => typeof id === 'string',
      )
    : []
  const currentAiChatConversations: AiChatConversation[] = Array.isArray(
    storageData[AI_CHAT_CONVERSATIONS_KEY],
  )
    ? storageData[AI_CHAT_CONVERSATIONS_KEY]
    : []
  const currentActiveAiChatConversationId =
    typeof storageData[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY] === 'string'
      ? storageData[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]
      : ''
  const currentSavedAnalyticsViews: SavedAnalyticsView[] = Array.isArray(
    storageData.savedAnalyticsViews,
  )
    ? storageData.savedAnalyticsViews
    : []
  const mergedSettings = mergeUserSettings(
    currentSettings,
    importedData.userSettings,
  )
  const mergedCategories = mergeParentCategoriesData(
    currentCategories,
    importedData.parentCategories,
  )
  const mergedTabs = await mergeTabsByDomain(
    currentTabs,
    normalizedImportedTabs,
    bulkUrlRecordMap,
  )
  const mergedCustomProjectData = alignCustomProjectsWithSavedTabs({
    customProjectOrder: shouldImportCustomProjects(importedData)
      ? [
          ...currentCustomProjectOrder,
          ...normalizeCustomProjectOrder(
            importedData.customProjectOrder,
            resolvedImportedCustomProjects,
          ).filter((id) => !currentCustomProjectOrder.includes(id)),
        ]
      : currentCustomProjectOrder,
    customProjects: shouldImportCustomProjects(importedData)
      ? mergeImportedCustomProjects(
          currentCustomProjects,
          currentCustomProjectOrder,
          resolvedImportedCustomProjects,
          importedData.customProjectOrder,
        ).customProjects
      : currentCustomProjects,
    language: mergedSettings.language,
    tabGroups: mergedTabs,
  })
  const mergedAiChatHistory = resolveMergedAiChatHistory({
    currentActiveConversationId: currentActiveAiChatConversationId,
    currentConversations: currentAiChatConversations,
    importedData,
  })
  const mergedSavedAnalyticsViews = shouldImportSavedAnalyticsViews(
    importedData,
  )
    ? mergeSavedAnalyticsViews(
        currentSavedAnalyticsViews,
        importedData.savedAnalyticsViews!,
      )
    : undefined
  await Promise.all([
    saveUserSettings(mergedSettings),
    saveParentCategories(mergedCategories),
    chrome.storage.local.set({
      customProjectOrder: mergedCustomProjectData.customProjectOrder,
      customProjects: mergedCustomProjectData.customProjects,
      ...(mergedAiChatHistory
        ? {
            [ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]:
              mergedAiChatHistory.activeConversationId,
            [AI_CHAT_CONVERSATIONS_KEY]: mergedAiChatHistory.conversations,
          }
        : {}),
      ...(mergedSavedAnalyticsViews
        ? {
            savedAnalyticsViews: mergedSavedAnalyticsViews,
          }
        : {}),
      savedTabs: mergedTabs,
    }),
  ])
  const unresolvedWarning = await createUnresolvedWarning(
    unresolvedTabs,
    translate,
  )
  const addedCategories = countAddedCategories(
    importedData.parentCategories,
    currentCategories,
  )
  const addedDomains = countAddedDomains(normalizedImportedTabs, currentTabs)
  console.log('マージ完了: 新形式URLデータで保存済み')
  return {
    success: true,
    message: translate
      ? translate('options.importExport.mergeSuccess', undefined, {
          categories: String(addedCategories),
          domains: String(addedDomains),
          unresolved: unresolvedWarning,
        })
      : `データをマージしました (${addedCategories}個のカテゴリと${addedDomains}個のドメインを追加)${unresolvedWarning}`,
  }
}
const importWithOverwrite = async ({
  importedData,
  normalizedImportedTabs,
  unresolvedTabs,
  resolvedImportedCustomProjects,
  bulkUrlRecordMap,
  translate,
}: ImportExecutionParams & {
  translate?: Translate
}): Promise<ImportResult> => {
  const cleanParentCategories = importedData.parentCategories.map(
    normalizeImportedCategory,
  )
  const cleanTabGroups = await buildOverwriteTabs(
    normalizedImportedTabs,
    bulkUrlRecordMap,
  )
  const overwriteCustomProjectData = alignCustomProjectsWithSavedTabs({
    customProjectOrder: shouldImportCustomProjects(importedData)
      ? importedData.customProjectOrder
      : [],
    customProjects: shouldImportCustomProjects(importedData)
      ? overwriteImportedCustomProjects(
          resolvedImportedCustomProjects,
          importedData.customProjectOrder,
        ).customProjects
      : [],
    language: importedData.userSettings.language,
    tabGroups: cleanTabGroups,
  })
  const overwriteAiChatHistory = resolveOverwriteAiChatHistory(importedData)
  const overwriteSavedAnalyticsViews = shouldImportSavedAnalyticsViews(
    importedData,
  )
    ? importedData.savedAnalyticsViews!
    : undefined
  await Promise.all([
    saveUserSettings({
      ...defaultSettings,
      ...importedData.userSettings,
    }),
    saveParentCategories(cleanParentCategories),
    chrome.storage.local.set({
      customProjectOrder: overwriteCustomProjectData.customProjectOrder,
      customProjects: overwriteCustomProjectData.customProjects,
      ...(overwriteAiChatHistory
        ? {
            [ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]:
              overwriteAiChatHistory.activeConversationId,
            [AI_CHAT_CONVERSATIONS_KEY]: overwriteAiChatHistory.conversations,
          }
        : {}),
      ...(overwriteSavedAnalyticsViews
        ? {
            savedAnalyticsViews: overwriteSavedAnalyticsViews,
          }
        : {}),
      savedTabs: cleanTabGroups,
    }),
  ])
  const [unresolvedWarning] = await Promise.all([
    createUnresolvedWarning(unresolvedTabs, translate),
    migrateToUrlsStorage(),
  ])
  const formattedTimestamp = formatLocaleDateTime(
    new Date(importedData.timestamp).getTime(),
  )
  return {
    success: true,
    message: translate
      ? translate('options.importExport.replaceSuccess', undefined, {
          timestamp: formattedTimestamp,
          unresolved: unresolvedWarning,
          version: importedData.version,
        })
      : `設定とタブデータを置き換えました（バージョン: ${importedData.version}、作成日時: ${formattedTimestamp}）${unresolvedWarning}`,
  }
}
const importSettings = async (
  jsonData: string,
  mergeData = true, // デフォルトでマージを有効に
  translate?: Translate,
): Promise<{
  success: boolean
  message: string
}> => {
  try {
    await migrateToUrlsStorage()
    const importedData = parseBackupData(jsonData)
    if (!importedData) {
      return {
        success: false,
        message: translate
          ? translate('options.importExport.importFormatError')
          : 'インポートされたデータの形式が正しくありません',
      }
    }
    const importedUrlRecordMap = createImportedUrlRecordMap(importedData)
    const currentUrlRecordMap = await createCurrentUrlRecordMap()
    const { normalizedImportedTabs, unresolvedTabs } =
      normalizeImportedTabsForImport(
        importedData.savedTabs,
        importedUrlRecordMap,
        currentUrlRecordMap,
      )
    const normalizedImportedCustomProjects = shouldImportCustomProjects(
      importedData,
    )
      ? normalizeImportedCustomProjectsForImport(
          importedData.customProjects,
          importedUrlRecordMap,
          currentUrlRecordMap,
        )
      : []
    const bulkUrlRecordMap = await buildBulkUrlRecordMap(
      normalizedImportedTabs,
      normalizedImportedCustomProjects,
    )
    const resolvedImportedCustomProjects = shouldImportCustomProjects(
      importedData,
    )
      ? await resolveImportedCustomProjects(
          normalizedImportedCustomProjects,
          bulkUrlRecordMap,
        )
      : []
    if (unresolvedTabs.length > 0) {
      console.warn(
        'URLデータ未解決ドメイン（代替URLを生成して継続）:',
        unresolvedTabs.map((tab) => tab.domain).join(', '),
      )
    }
    if (mergeData) {
      return importWithMerge({
        bulkUrlRecordMap,
        importedData,
        normalizedImportedTabs,
        resolvedImportedCustomProjects,
        translate,
        unresolvedTabs,
      })
    }
    return importWithOverwrite({
      bulkUrlRecordMap,
      importedData,
      normalizedImportedTabs,
      resolvedImportedCustomProjects,
      translate,
      unresolvedTabs,
    })
  } catch (error) {
    console.error('インポートエラー:', error)
    return {
      success: false,
      message: translate
        ? translate('options.importExport.importError')
        : 'データのインポート中にエラーが発生しました',
    }
  }
}

const getImportPreview = (
  jsonData: string,
): {
  success: boolean
  message: string
  preview?: {
    version: string
    timestamp: string
    categoriesCount: number
    domainsCount: number
    projectsCount: number
    hasAiChat: boolean
    hasAnalytics: boolean
  }
} => {
  try {
    const importedData = parseBackupData(jsonData)
    if (!importedData) {
      return {
        success: false,
        message: 'インポートされたデータの形式が正しくありません',
      }
    }
    return {
      success: true,
      message: 'データの解析に成功しました',
      preview: {
        version: importedData.version,
        timestamp: importedData.timestamp,
        categoriesCount: importedData.parentCategories.length,
        domainsCount: importedData.savedTabs.length,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        projectsCount: importedData.customProjects?.length || 0,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        hasAiChat: (importedData.aiChatConversations?.length || 0) > 0,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        hasAnalytics: (importedData.savedAnalyticsViews?.length || 0) > 0,
      },
    }
  } catch (error) {
    console.error('プレビュー解析エラー:', error)
    return {
      success: false,
      message: 'データの解析中にエラーが発生しました',
    }
  }
}

export type { BackupData }
export {
  alignCustomProjectsWithSavedTabs,
  convertCustomProjectToExportUrls,
  convertImportedCustomProjectUrlsToStorage,
  downloadAsJson,
  ensurePlaceholderUrlRecords,
  exportSettings,
  getImportPreview,
  importSettings,
  mergeImportedCustomProjects,
  normalizeImportedCustomProject,
  normalizeImportedCustomProjectsForImport,
  overwriteImportedCustomProjects,
  resolveMergedAiChatHistory,
  resolveImportedCustomProjects,
  resolveOverwriteAiChatHistory,
  resolveCurrentLanguage,
  restoreImportedCustomProjectUrlsFromIds,
}

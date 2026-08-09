import type {
  ParentCategory,
  SubCategoryKeyword,
  TabGroup,
  UrlRecord,
} from '@/contexts/saved-tabs/public-api'
import { normalizeDomainString } from '@/contexts/saved-tabs/public-api'
import type { AiChatConversation } from '@/features/ai-chat/types'
import type {
  BackupData,
  ConvertedUrlData,
  ImportedCustomProjectData,
  ImportedCustomProjectUrlData,
  ImportedTabData,
  ImportedUrlData,
} from '@/features/options/lib/import-export/schemas'
import { redactUrlForLog } from '@/lib/logging/redact-url'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import { getUserSettings } from '@/lib/storage/settings'
import { createOrUpdateUrlRecordsBatch } from '@/lib/storage/urls'
import type { UserSettings } from '@/types/storage'

import {
  alignCustomProjectsWithSavedTabs,
  mergeImportedCustomProjects,
  mergeOrderedSubCategories,
  mergeOrderedSubCategoriesWithUncategorized,
  normalizeCategoryKeywords,
  normalizeCustomProjectOrder,
  normalizeImportedCustomProject,
  normalizeStringArray,
  normalizeSubCategories,
  normalizeSubCategoryOrder,
  normalizeSubCategoryOrderWithUncategorized,
  overwriteImportedCustomProjects,
} from './custom-projects'
import {
  convertImportedUrlsToNewFormat,
  convertTabGroupToExportUrls,
  ensurePlaceholderUrlRecords,
  getPlaceholderUrlTitle,
  normalizeUrlKey,
  resolveCurrentLanguage,
  resolveUrlDataForStorage,
} from './url-conversion'

const BULK_URL_CONVERSION_THRESHOLD = 100

type NormalizedImportResult = {
  normalizedImportedTabs: (ImportedTabData & { urls: ImportedUrlData[] })[]
  unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[]
}
type NormalizedImportedTab =
  NormalizedImportResult['normalizedImportedTabs'][number]
type UnresolvedImportTab = NormalizedImportResult['unresolvedTabs'][number]

/**
 * CategoryKeywordsをカテゴリ名単位でマージする
 */
const mergeCategoryKeywords = (
  existing: SubCategoryKeyword[] | undefined,
  imported: unknown[] | undefined,
): SubCategoryKeyword[] => {
  const keywordMap = new Map<string, SubCategoryKeyword>()
  for (const keyword of existing ?? []) {
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
 *
 * `urlSubCategories` のキーは `mergedUrlIds` に含まれていない場合、
 * 後続の `tabGroupRepository.saveAll` 経路で
 * `ChromeSavedTabsStorageMapper.toSavedTabRaw` が `preservedUrlIds`
 * 基準で捨てる孤立エントリになる。インポート時にここでフィルタする
 * ことで、保存経路の差異に関わらず `urlSubCategories` が
 * `urlIds` と整合した状態になる（issue #548）。
 */
const mergeUrlData = (
  existingTab: TabGroup,
  importedUrlData: ConvertedUrlData,
): ConvertedUrlData => {
  const urlIdSet = new Set(existingTab.urlIds)
  for (const urlId of importedUrlData.urlIds) {
    urlIdSet.add(urlId)
  }
  const mergedUrlSubCategories: Record<string, string> = {}
  for (const [urlId, subCategory] of Object.entries({
    ...existingTab.urlSubCategories,
    ...importedUrlData.urlSubCategories,
  })) {
    if (urlIdSet.has(urlId)) {
      mergedUrlSubCategories[urlId] = subCategory
    }
  }
  return {
    urlIds: [...urlIdSet],
    urlSubCategories:
      Object.keys(mergedUrlSubCategories).length > 0
        ? mergedUrlSubCategories
        : undefined,
  }
}

const mergeUserSettings = (
  currentSettings: UserSettings,
  importedSettings: Partial<UserSettings>,
): UserSettings => ({
  ...currentSettings,
  ...importedSettings,
  excludePatterns: [
    ...new Set([
      ...currentSettings.excludePatterns,
      ...(importedSettings.excludePatterns ?? []),
    ]),
  ],
})

const normalizeImportedCategory = (
  category: ParentCategory,
): ParentCategory => {
  return {
    domainNames: category.domainNames,
    domains: category.domains,
    id: category.id,
    name: category.name,
  }
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
  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should not be treated as valid timestamp
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
    domain: normalizeDomainString(existingTab.domain),
    urlIds: mergedUrlData.urlIds,
    urlSubCategories: mergedUrlData.urlSubCategories,
    parentCategoryId:
      // eslint-disable-next-line typescript/prefer-nullish-coalescing -- empty string should fall through
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
    domain: normalizeDomainString(importedTab.domain),
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
    tabMapByDomain.set(normalizeDomainString(tab.domain), tab)
  }
  const mergedImportedTabs = await Promise.all(
    normalizedImportedTabs.map(async (importedTab) => {
      const existingTab = tabMapByDomain.get(importedTab.domain)
      if (existingTab) {
        console.log(
          `マージ処理: 既存ドメイン ${redactUrlForLog(importedTab.domain)}`,
        )
        return {
          domain: importedTab.domain,
          tab: await buildMergedExistingDomainTab(
            existingTab,
            importedTab,
            urlRecordMapByUrl,
          ),
        }
      }
      console.log(
        `マージ処理: 新規ドメイン ${redactUrlForLog(importedTab.domain)}`,
      )
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
      console.log(
        `上書きモード: ${redactUrlForLog(importedTab.domain)} を新形式に変換中...`,
      )
      return buildMergedNewDomainTab(importedTab, urlRecordMapByUrl)
    }),
  )

type Translate = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

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
        title: urlData.title ?? '',
        url: normalizeUrlKey(urlData.url),
      })),
    ),
    ...normalizedImportedCustomProjects.flatMap((project) =>
      project.urls.map((urlData) => ({
        url: normalizeUrlKey(urlData.url),
        title: urlData.title ?? '',
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
  return createOrUpdateUrlRecordsBatch(importedUrlItems, {
    preserveExistingOnDuplicate: true,
  })
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
    importedData.aiChatConversations ?? [],
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

  const conversations = importedData.aiChatConversations ?? []

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

export {
  alignCustomProjectsWithSavedTabs,
  buildBulkUrlRecordMap,
  buildMergedExistingDomainTab,
  buildMergedNewDomainTab,
  buildOverwriteTabs,
  BULK_URL_CONVERSION_THRESHOLD,
  convertTabGroupToExportUrls,
  countAddedCategories,
  countAddedDomains,
  createUnresolvedWarning,
  ensurePlaceholderUrlRecords,
  mergeAiChatConversations,
  mergeCategoryKeywords,
  mergeImportedCustomProjects,
  mergeParentCategoriesData,
  mergeSavedAnalyticsViews,
  mergeSubCategories,
  mergeTabsByDomain,
  mergeUrlData,
  mergeUserSettings,
  normalizeCategoryKeywords,
  normalizeCustomProjectOrder,
  normalizeImportedCategory,
  normalizeImportedCustomProject,
  normalizeStringArray,
  normalizeSubCategories,
  overwriteImportedCustomProjects,
  resolveAiChatActiveConversationId,
  resolveImportedTabUrlData,
  resolveMergedAiChatHistory,
  resolveMergedSavedAt,
  resolveOverwriteAiChatHistory,
  shouldImportAiChatHistory,
  shouldImportCustomProjects,
  shouldImportSavedAnalyticsViews,
}
export type {
  NormalizedImportedTab,
  NormalizedImportResult,
  Translate,
  UnresolvedImportTab,
}

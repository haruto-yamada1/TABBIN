import { getAppVersion } from '@/constants/app-version'
import {
  ACTIVE_AI_CHAT_CONVERSATION_ID_KEY,
  AI_CHAT_CONVERSATIONS_KEY,
  loadConversationHistory,
} from '@/features/ai-chat/lib/conversation-history'
import type { AiChatConversation } from '@/features/ai-chat/types'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { redactUrlForLog } from '@/lib/logging/redact-url'
import { assertBackupSerializedBytes } from '@/lib/persistence/backupResourcePolicy'
import { loadSavedAnalyticsViews } from '@/lib/storage/analytics'
import {
  getParentCategories,
  saveParentCategories,
} from '@/lib/storage/categories'
import { migrateToUrlsStorage } from '@/lib/storage/migration'
import {
  getCustomProjectOrder,
  getCustomProjects,
} from '@/lib/storage/projects'
import {
  defaultSettings,
  getUserSettings as getUserSettingsFromStorage,
  saveUserSettings,
} from '@/lib/storage/settings'
import { getSavedTabs } from '@/lib/storage/tabs'
import { getUrlRecords } from '@/lib/storage/urls'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'
import { formatLocaleDateTime } from '@/utils/localDateTime'

import {
  alignCustomProjectsWithSavedTabs,
  mergeImportedCustomProjects,
  normalizeCustomProjectOrder,
  normalizeImportedCustomProject,
  normalizeImportedCustomProjectsForImport,
  overwriteImportedCustomProjects,
  resolveImportedCustomProjects,
  toExportCustomProject,
} from './custom-projects'
import type { BackupData, ImportedUrlRecordData } from './schemas'
import { parseBackupData } from './schemas'
import {
  buildBulkUrlRecordMap,
  buildOverwriteTabs,
  countAddedCategories,
  countAddedDomains,
  createUnresolvedWarning,
  mergeParentCategoriesData,
  mergeSavedAnalyticsViews,
  mergeTabsByDomain,
  mergeUserSettings,
  normalizeImportedCategory,
  resolveMergedAiChatHistory,
  resolveOverwriteAiChatHistory,
  shouldImportCustomProjects,
  shouldImportSavedAnalyticsViews,
} from './settings-merge'
import {
  convertTabGroupToExportUrls,
  ensurePlaceholderUrlRecords,
  getPlaceholderUrlTitle,
  normalizeImportedTabsForImport,
  resolveCurrentLanguage,
} from './url-conversion'

type ImportResult = {
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

type ImportExecutionParams = {
  importedData: BackupData
  normalizedImportedTabs: NormalizedImportedTab[]
  unresolvedTabs: UnresolvedImportTab[]
  resolvedImportedCustomProjects: CustomProject[]
  bulkUrlRecordMap?: Map<string, UrlRecord>
}

const createImportedUrlRecordMap = (
  importedData: BackupData,
): Map<string, ImportedUrlRecordData> =>
  new Map(
    (importedData.urls ?? []).map((urlRecord) => [urlRecord.id, urlRecord]),
  )

const createCurrentUrlRecordMap = async (): Promise<Map<string, UrlRecord>> => {
  const currentUrlRecords = await getUrlRecords()
  return new Map(
    currentUrlRecords.map((urlRecord) => [urlRecord.id, urlRecord]),
  )
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
    const [
      userSettings,
      customProjectOrder,
      customProjectsRaw,
      parentCategories,
      savedAnalyticsViews,
      savedTabs,
      urls,
    ] = await Promise.all([
      getUserSettingsFromStorage(),
      getCustomProjectOrder(),
      getCustomProjects(),
      getParentCategories(),
      loadSavedAnalyticsViews(),
      getSavedTabs(),
      getUrlRecords(),
    ])
    // parentCategories is already typed from getParentCategories()
    // savedTabs is already typed from getSavedTabs()
    const storedCustomProjects: CustomProject[] = customProjectsRaw.map(
      (project) => normalizeImportedCustomProject(project),
    )
    // customProjectOrder is already typed from getCustomProjectOrder()
    const aiChatHistory = await loadConversationHistory()
    const aiChatConversations: AiChatConversation[] =
      aiChatHistory.conversations
    const activeAiChatConversationId = aiChatHistory.activeConversationId
    const urlRecordMap = new Map(
      urls.map((urlRecord) => [urlRecord.id, urlRecord]),
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
      version: getAppVersion(),
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
  const json = JSON.stringify(data)
  const blob = new Blob([json], {
    type: 'application/json',
  })
  assertBackupSerializedBytes(blob.size)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()

  // クリーンアップ
  requestAnimationFrame(() => {
    // eslint-disable-next-line unicorn/prefer-dom-node-remove
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })
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
  const [
    currentSettings,
    currentCustomProjectOrderRaw,
    currentCustomProjectsRaw,
    currentParentCategories,
    currentSavedAnalyticsViewsRaw,
    currentTabsRaw,
    currentAiChatHistory,
  ] = await Promise.all([
    getUserSettingsFromStorage(),
    getCustomProjectOrder(),
    getCustomProjects(),
    getParentCategories(),
    loadSavedAnalyticsViews(),
    getSavedTabs(),
    loadConversationHistory(),
  ])
  const currentCategories: ParentCategory[] = currentParentCategories
  const currentTabs: TabGroup[] = currentTabsRaw
  const currentCustomProjects: CustomProject[] = currentCustomProjectsRaw.map(
    (project) => normalizeImportedCustomProject(project),
  )
  const currentCustomProjectOrder: string[] = currentCustomProjectOrderRaw
  const currentAiChatConversations: AiChatConversation[] =
    currentAiChatHistory.conversations
  const currentActiveAiChatConversationId =
    currentAiChatHistory.activeConversationId
  const currentSavedAnalyticsViews = currentSavedAnalyticsViewsRaw
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
  const mergedSavedAnalyticsViews =
    shouldImportSavedAnalyticsViews(importedData) &&
    importedData.savedAnalyticsViews
      ? mergeSavedAnalyticsViews(
          currentSavedAnalyticsViews,
          importedData.savedAnalyticsViews,
        )
      : undefined
  await Promise.all([
    saveUserSettings(mergedSettings),
    saveParentCategories(mergedCategories),
    (async () => {
      const storageLocal = getChromeStorageLocal()
      if (!storageLocal) {
        return
      }
      await storageLocal.set({
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
          ? { savedAnalyticsViews: mergedSavedAnalyticsViews }
          : {}),
        savedTabs: mergedTabs,
      })
    })(),
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
  const overwriteSavedAnalyticsViews =
    shouldImportSavedAnalyticsViews(importedData) &&
    importedData.savedAnalyticsViews
      ? importedData.savedAnalyticsViews
      : undefined
  await Promise.all([
    saveUserSettings({
      ...defaultSettings,
      ...importedData.userSettings,
    }),
    saveParentCategories(cleanParentCategories),
    (async () => {
      const storageLocal = getChromeStorageLocal()
      if (!storageLocal) {
        return
      }
      await storageLocal.set({
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
          ? { savedAnalyticsViews: overwriteSavedAnalyticsViews }
          : {}),
        savedTabs: cleanTabGroups,
      })
    })(),
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
        unresolvedTabs.map((tab) => redactUrlForLog(tab.domain)).join(', '),
      )
    }
    if (mergeData) {
      // eslint-disable-next-line typescript/return-await
      return importWithMerge({
        bulkUrlRecordMap,
        importedData,
        normalizedImportedTabs,
        resolvedImportedCustomProjects,
        translate,
        unresolvedTabs,
      })
    }
    // eslint-disable-next-line typescript/return-await
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
        projectsCount: importedData.customProjects?.length ?? 0,
        hasAiChat: (importedData.aiChatConversations?.length ?? 0) > 0,
        hasAnalytics: (importedData.savedAnalyticsViews?.length ?? 0) > 0,
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

export {
  alignCustomProjectsWithSavedTabs,
  createCurrentUrlRecordMap,
  createImportedUrlRecordMap,
  downloadAsJson,
  ensurePlaceholderUrlRecords,
  exportSettings,
  getImportPreview,
  getPlaceholderUrlTitle,
  importSettings,
  importWithMerge,
  importWithOverwrite,
  parseBackupData,
  resolveCurrentLanguage,
  toExportCustomProject,
}
export type { BackupData, ImportResult, Translate }

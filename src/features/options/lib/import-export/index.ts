// インポート・エクスポート機能
//
// 内部は責務単位で分割している。public な API は変えない。
//   - schemas        : Zod スキーマ + BackupData 型 + parseBackupData
//   - url-conversion : URL 変換・リストア・プレースホルダ・言語 / 共通定数
//   - custom-projects: カスタムプロジェクトの正規化・マージ・変換
//   - settings-merge : 設定マージ・AI 履歴・Analytics views・タブマージ
//   - flows          : export / import / preview などの entry point

// ----- カスタムプロジェクト -----
export {
  alignCustomProjectsWithSavedTabs,
  buildCustomProjectUrlIdList,
  buildSanitizedCustomProject,
  buildUncategorizedCustomProject,
  convertCustomProjectToExportUrls,
  convertImportedCustomProjectUrlsToStorage,
  mergeImportedCustomProjects,
  mergeOrderedSubCategories,
  mergeOrderedSubCategoriesWithUncategorized,
  normalizeCategoryKeywords,
  normalizeCustomProjectOrder,
  normalizeImportedCustomProject,
  normalizeImportedCustomProjectsForImport,
  normalizeProjectKeywords,
  normalizeStringArray,
  normalizeSubCategories,
  normalizeSubCategoryOrder,
  normalizeSubCategoryOrderWithUncategorized,
  overwriteImportedCustomProjects,
  resolveImportedCustomProject,
  resolveImportedCustomProjects,
  restoreImportedCustomProjectUrlsFromIds,
  sanitizeCustomProjectMetadata,
  stripCustomProjectUrls,
  toExportCustomProject,
} from './custom-projects'

// ----- 設定マージ (settings-merge) -----
export {
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
  mergeParentCategoriesData,
  mergeSavedAnalyticsViews,
  mergeSubCategories,
  mergeTabsByDomain,
  mergeUrlData,
  mergeUserSettings,
  normalizeImportedCategory,
  resolveAiChatActiveConversationId,
  resolveImportedTabUrlData,
  resolveMergedAiChatHistory,
  resolveMergedSavedAt,
  resolveOverwriteAiChatHistory,
  shouldImportAiChatHistory,
  shouldImportCustomProjects,
  shouldImportSavedAnalyticsViews,
} from './settings-merge'

// ----- スキーマ -----
export { backupDataSchema, parseBackupData } from './schemas'
export type {
  BackupData,
  ConvertedUrlData,
  ImportedCustomProjectData,
  ImportedCustomProjectUrlData,
  ImportedTabData,
  ImportedUrlData,
  ImportedUrlRecordData,
} from './schemas'

// ----- URL 変換 -----
export {
  buildConvertedUrlData,
  convertImportedUrlsToNewFormat,
  convertImportedUrlsWithPreloadedMap,
  CUSTOM_UNCATEGORIZED_PROJECT_ID,
  getPlaceholderUrlTitle,
  getUncategorizedProjectName,
  IMPORT_URL_RECORD_OPTIONS,
  normalizeImportedTabsForImport,
  normalizeUrlKey,
  resolveCurrentLanguage,
  resolveUrlDataForStorage,
  restoreImportedUrlsFromIds,
} from './url-conversion'

// ----- flows (entry points) -----
export {
  createCurrentUrlRecordMap,
  createImportedUrlRecordMap,
  downloadAsJson,
  exportSettings,
  getImportPreview,
  importSettings,
  importWithMerge,
  importWithOverwrite,
} from './flows'

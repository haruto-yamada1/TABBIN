/**
 * `saved-tabs` 機能で `chrome.storage.local` に書き込む storage key の一覧。
 *
 * 文字列リテラルが複数ファイルに散らばることを防ぐため、必ずこの定数経由で
 * 参照する。typo は TypeScript の型で検出できる。
 *
 * 旧 `src/lib/storage/*` と同じキー名を維持しているため、既存ユーザーの
 * データ（`chrome.storage.local.savedTabs` / `urls` / `parentCategories` /
 * `customProjects` / `customProjectOrder`）はそのまま読み書きできる。
 *
 * 並び替え順序など付随する storage key（`customProjectOrder` /
 * `domainCategoryMappings` / `domainCategorySettings` /
 * `urlsMigrationCompleted`）のうち、`customProjectOrder` は
 * `CustomProjectRepository.findOrder` / `saveOrder` 経由で扱う DDD
 * 永続化境界に取り込んだ（issue #487）。残りは別 issue で
 * domain / repository 化する。
 */

export const SAVED_TABS_KEY = 'savedTabs' as const

export const URLS_KEY = 'urls' as const

export const PARENT_CATEGORIES_KEY = 'parentCategories' as const

export const CUSTOM_PROJECTS_KEY = 'customProjects' as const

export const CUSTOM_PROJECT_ORDER_KEY = 'customProjectOrder' as const

export const USER_SETTINGS_KEY = 'userSettings' as const

export const DOMAIN_CATEGORY_MAPPINGS_KEY = 'domainCategoryMappings' as const

export const DOMAIN_CATEGORY_SETTINGS_KEY = 'domainCategorySettings' as const

export const URLS_MIGRATION_COMPLETED_KEY = 'urlsMigrationCompleted' as const

export const SAVED_TABS_STORAGE_KEYS = [
  SAVED_TABS_KEY,
  URLS_KEY,
  PARENT_CATEGORIES_KEY,
  CUSTOM_PROJECTS_KEY,
  CUSTOM_PROJECT_ORDER_KEY,
] as const

export type SavedTabsStorageKey = (typeof SAVED_TABS_STORAGE_KEYS)[number]

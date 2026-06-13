/**
 * `saved-tabs` 機能で `chrome.storage.local` に書き込む storage key の一覧。
 *
 * 文字列リテラルが複数ファイルに散らばることを防ぐため、必ずこの定数経由で
 * 参照する。typo は TypeScript の型で検出できる。
 *
 * 旧 `src/lib/storage/*` と同じキー名を維持しているため、既存ユーザーの
 * データ（`chrome.storage.local.savedTabs` / `urls` / `parentCategories` /
 * `customProjects`）はそのまま読み書きできる。
 *
 * 並び替え順序など付随する storage key（`customProjectOrder` /
 * `domainCategoryMappings` / `domainCategorySettings` /
 * `urlsMigrationCompleted`）は別 issue で domain / repository 化するため、
 * ここでは 4 つのメイン key だけを公開する。
 */

export const SAVED_TABS_KEY = 'savedTabs' as const

export const URLS_KEY = 'urls' as const

export const PARENT_CATEGORIES_KEY = 'parentCategories' as const

export const CUSTOM_PROJECTS_KEY = 'customProjects' as const

export const SAVED_TABS_STORAGE_KEYS = [
  SAVED_TABS_KEY,
  URLS_KEY,
  PARENT_CATEGORIES_KEY,
  CUSTOM_PROJECTS_KEY,
] as const

export type SavedTabsStorageKey = (typeof SAVED_TABS_STORAGE_KEYS)[number]

/**
 * 旧 `src/lib/storage/projects` の高レベル操作を port として再公開する
 * DDD 境界 interface。
 *
 * 背景:
 * - `lib/storage/projects` には `addCategoryToProject` /
 *   `removeCategoryFromProject` / `setUrlCategory` /
 *   `renameCategoryInProject` / `updateCategoryKeywords` など、entity
 *   化されない rich 補助フィールド (`projectKeywords` / `urlMetadata` /
 *   `categoryOrder` / legacy `urls`) を mutate する操作が含まれる。
 * - chrome-storage repository 経由では entity に載らないこれらの
 *   フィールドを mutate できないため、本 port は実装側で lib/storage
 *   関数への delegate にとどめる。
 * - presentation 層はこの port 越しに呼び出すことで
 *   `@/lib/storage/projects` の直接 import を避ける
 *   (issue #509)。
 *
 * 旧 `lib/storage` 自体はこの PR では削除しない方針のため、本 port も
 * あくまで互換層として lib/storage をラップする。`lib/storage` の
 * 全面 DDD 化は別 issue で段階的に行う。
 */
import type { ResolvedCustomProjectUrlDto } from '@/contexts/saved-tabs/application/dto/ResolvedCustomProjectUrlDto'
import type { SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export type CustomProjectsCommandService = {
  /**
   * 旧 `addCategoryToProject` の port 版。カテゴリが既に存在する場合は
   * no-op。`categoryOrder` 末尾に追加する。
   */
  addCategoryToProject: (
    projectId: string,
    categoryName: string,
  ) => Promise<void>

  /**
   * 旧 `removeCategoryFromProject` の port 版。`urlMetadata` 内の
   * `category` フィールドもクリアする。
   */
  removeCategoryFromProject: (
    projectId: string,
    categoryName: string,
  ) => Promise<void>

  /**
   * 旧 `setUrlCategory` の port 版。`urlMetadata` の `category` を更新する。
   */
  setUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => Promise<void>

  /**
   * 旧 `updateCategoryOrder` の port 版。
   */
  updateCategoryOrder: (projectId: string, newOrder: string[]) => Promise<void>

  /**
   * 旧 `reorderProjectUrls` の port 版。`urlIds` 順序を引数の `urls`
   * 配列に揃える。
   */
  reorderProjectUrls: (
    projectId: string,
    urls: readonly ResolvedCustomProjectUrlDto[],
  ) => Promise<void>

  /**
   * 旧 `updateProjectKeywords` の port 版。`projectKeywords` を上書き。
   */
  updateProjectKeywords: (
    projectId: string,
    projectKeywords: ProjectKeywordSettings,
  ) => Promise<void>

  /**
   * 旧 `renameCategoryInProject` の port 版。`categories` /
   * `categoryOrder` / `urlMetadata.category` すべてで rename を反映する。
   */
  renameCategoryInProject: (
    projectId: string,
    oldCategoryName: string,
    newCategoryName: string,
  ) => Promise<void>

  /**
   * 旧 `addUrlToCustomProject` の port 版。新規 / 既存 URL をプロジェクト
   * に追加し、必要ならドメイン側 (TabGroup) にも同期する。
   */
  addUrlToCustomProject: (
    projectId: string,
    url: string,
    title: string,
    options?: {
      notes?: string
      category?: string
    },
  ) => Promise<void>

  /**
   * 旧 `removeUrlFromCustomProject` の port 版。プロジェクトから URL を
   * 削除し、ドメイン側 (TabGroup) からも同期削除する。
   */
  removeUrlFromCustomProject: (projectId: string, url: string) => Promise<void>

  /**
   * 旧 `removeUrlsFromCustomProject` の port 版。
   */
  removeUrlsFromCustomProject: (
    projectId: string,
    urls: string[],
  ) => Promise<void>

  /**
   * 旧 `moveUrlBetweenCustomProjects` の port 版。
   */
  moveUrlBetweenCustomProjects: (
    sourceProjectId: string,
    targetProjectId: string,
    url: string,
  ) => Promise<void>

  /**
   * 旧 `removeUrlsFromAllCustomProjects` の port 版。URL 文字列で指定。
   */
  removeUrlsFromAllCustomProjects: (
    urls: string[],
    options?: { throwOnError?: boolean },
  ) => Promise<void>

  /**
   * 旧 `removeUrlIdsFromAllCustomProjects` の port 版。URL ID で指定。
   */
  removeUrlIdsFromAllCustomProjects: (
    urlIds: string[],
    options?: { throwOnError?: boolean },
  ) => Promise<void>
}

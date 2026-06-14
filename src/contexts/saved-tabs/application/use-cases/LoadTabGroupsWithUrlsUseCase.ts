import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { resolveTabGroupsWithUrls } from '../../domain/services/TabGroupUrlResolver'
import type { LoadTabGroupsWithUrlsCommand } from '../commands/LoadTabGroupsWithUrlsCommand'
import type { LoadTabGroupsWithUrlsDto } from '../dto/LoadTabGroupsWithUrlsDto'

/**
 * `LoadTabGroupsWithUrlsUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface LoadTabGroupsWithUrlsUseCaseDeps {
  readonly urlRecordRepository: UrlRecordRepository
}

/**
 * `LoadTabGroupsWithUrlsUseCase` の関数型。
 *
 * presentation 層（`useTabData` 内の `loadTabGroupsWithUrls`）は
 * use-case を直接 import せず、composition 層で生成した関数を
 * 受け取って呼び出す形を推奨。
 */
export type LoadTabGroupsWithUrlsUseCase = (
  command: LoadTabGroupsWithUrlsCommand,
) => Promise<LoadTabGroupsWithUrlsDto>

/**
 * `LoadTabGroupsWithUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. `command.tabGroups` に含まれる `urlIds` を解決する。`urlIds` が
 *    空のグループは `urls: []` として返す（旧 `resolveTabGroupsWithUrls` と
 *    同じ挙動）。
 * 2. `urlSubCategories` の引き継ぎは `resolveTabGroupsWithUrls` 側で
 *    `UrlRecord` に `subCategory` を注入して行う。
 *
 * 旧 `src/lib/storage/tabs.resolveTabGroupsWithUrls` の domain 等価物。
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */
export const createLoadTabGroupsWithUrlsUseCase = (
  deps: LoadTabGroupsWithUrlsUseCaseDeps,
): LoadTabGroupsWithUrlsUseCase => {
  return async (command) => {
    if (command.tabGroups.length === 0) {
      return { tabGroups: [] }
    }
    const allUrlRecords = await deps.urlRecordRepository.findAll()
    return {
      tabGroups: resolveTabGroupsWithUrls({
        tabGroups: command.tabGroups,
        urlRecords: allUrlRecords,
      }),
    }
  }
}

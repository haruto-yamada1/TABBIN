import { getChromeGlobal } from '@/lib/browser/chrome-global'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { SavedTabsUseCasesDeps } from '../../application/SavedTabsUseCasesDeps'
import { createChromeBrowserTabAdapter } from '../browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike as ChromeApiLikeBase } from '../browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '../browser/ChromeBrowserWindowAdapter'
import { createChromeMessagingAdapter } from '../browser/ChromeMessagingAdapter'
import type { ChromeApiLike as ChromeMessagingApiLike } from '../browser/ChromeMessagingAdapter'
import { createChromeStorageChangeAdapter } from '../browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '../browser/SonnerNotificationAdapter'
import { createChromeCustomProjectRepository } from '../persistence/chrome-storage/ChromeCustomProjectRepository'
import { createChromeDomainCategoryMappingRepository } from '../persistence/chrome-storage/ChromeDomainCategoryMappingRepository'
import { createChromeDomainCategorySettingsRepository } from '../persistence/chrome-storage/ChromeDomainCategorySettingsRepository'
import { createChromeMigrationAdapter } from '../persistence/chrome-storage/ChromeMigrationAdapter'
import { createChromeParentCategoryRepository } from '../persistence/chrome-storage/ChromeParentCategoryRepository'
import { createLibRemoveSubCategoryFromTabGroupAdapter } from '../persistence/chrome-storage/ChromeRemoveSubCategoryFromTabGroupAdapter'
import { createLibSetCategoryKeywordsAdapter } from '../persistence/chrome-storage/ChromeSetCategoryKeywordsAdapter'
import { createChromeTabGroupRepository } from '../persistence/chrome-storage/ChromeTabGroupRepository'
import { createChromeUrlRecordRepository } from '../persistence/chrome-storage/ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from '../persistence/chrome-storage/ChromeUserSettingsRepository'
import { createLibCategoriesCommandService } from './LibCategoriesCommandService'
import { createLibCategoryAssignmentPort } from './LibCategoryAssignmentPort'
import { createLibCustomProjectsCommandService } from './LibCustomProjectsCommandService'

export type { SavedTabsUseCasesDeps } from '../../application/SavedTabsUseCasesDeps'

/**
 * `createSavedTabsUseCasesDeps` に渡せる任意設定。
 *
 * - `resolveActive` : `BrowserTabPort` 配下で開く新規タブを active にするかを
 *   実行時に解決する関数。presentation 層が `openUrlInBackground` 設定を
 *   ref 経由で読むために利用。未指定なら active 固定。
 */
export interface CreateSavedTabsUseCasesDepsOptions {
  readonly resolveActive?: () => boolean
}

interface ChromeLike extends ChromeApiLikeBase {
  readonly tabs?: {
    readonly create?: (createProperties: {
      readonly active?: boolean
      readonly url: string
    }) => Promise<{ readonly url?: string } | undefined> | undefined
  }
  readonly windows?: {
    readonly create?: (createProperties: {
      readonly focused?: boolean
      readonly url?: readonly string[] | string
    }) =>
      | Promise<
          { readonly tabs?: readonly { readonly url?: string }[] } | undefined
        >
      | undefined
  }
  readonly runtime?: {
    readonly sendMessage?: (
      message: unknown,
      callback?: (response: unknown) => void,
    ) => void
    readonly lastError?: { readonly message?: string } | undefined
  }
  readonly storage?: {
    readonly onChanged?: {
      readonly addListener: (callback: ChromeOnChangedListener) => void
      readonly removeListener: (callback: ChromeOnChangedListener) => void
    }
  }
}

type ChromeOnChangedListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const getChromeApi = (): ChromeLike | undefined => getChromeGlobal<ChromeLike>()

/**
 * chrome 実環境向けに SavedTabsUseCasesDeps を構築する。
 *
 * `chrome.storage.local` が無い環境（テストで `chrome` を未注入）では
 * `SavedTabsRepositoryUnavailableError` が repository factory から投げられる。
 * presentation 層はそれを呼び出し元（`SavedTabsPage`）でハンドルし、
 * loading 状態を `error` へ遷移させる。
 *
 * `options.resolveActive` を渡すと `BrowserTabPort` 配下の `open` が
 * 呼び出しごとに同関数を評価するため、presentation 層は settings ref の
 * 現在値を動的に反映できる。
 *
 * @example
 * ```tsx
 * const deps = createSavedTabsUseCasesDeps()
 * const controller = useSavedTabsController({ deps })
 * ```
 */
export const createSavedTabsUseCasesDeps = (
  options: CreateSavedTabsUseCasesDepsOptions = {},
): SavedTabsUseCasesDeps => {
  const local = getChromeStorageLocal()
  if (!local) {
    warnMissingChromeStorage('createSavedTabsUseCasesDeps')
  }
  const port = local
    ? {
        get: async (key: string) => local.get(key),
        remove: async (key: string) => local.remove(key),
        set: async (value: Record<string, unknown>) => local.set(value),
      }
    : null

  return {
    browserTabPort: createChromeBrowserTabAdapter(
      { getApi: () => getChromeApi() },
      options.resolveActive ? { resolveActive: options.resolveActive } : {},
    ),
    browserWindowPort: createChromeBrowserWindowAdapter({
      getApi: () => getChromeApi(),
    }),
    categoriesCommandService: createLibCategoriesCommandService(),
    categoryAssignmentPort: createLibCategoryAssignmentPort({
      parentCategoryRepository: createChromeParentCategoryRepository(port),
      tabGroupRepository: createChromeTabGroupRepository(port),
    }),
    customProjectRepository: createChromeCustomProjectRepository(port),
    customProjectsCommandService: createLibCustomProjectsCommandService(),
    domainCategoryMappingRepository:
      createChromeDomainCategoryMappingRepository(port),
    domainCategorySettingsRepository:
      createChromeDomainCategorySettingsRepository(port),
    migrationPort: createChromeMigrationAdapter(),
    messagingPort: createChromeMessagingAdapter({
      // `ChromeLike` は `BrowserTabPort` 由来の `ChromeApiLike` に対し
      // `runtime` / `storage` を追加で持つ拡張型。
      // `createChromeMessagingAdapter` は `runtime` を持つ別系統の
      // `ChromeApiLike` を要求するため、構造的部分型の境界を
      // unsafe cast で超える。
      getApi: () => {
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        return getChromeApi() as unknown as ChromeMessagingApiLike | undefined
      },
    }),
    notificationPort: createSonnerNotificationAdapter(),
    parentCategoryRepository: createChromeParentCategoryRepository(port),
    removeSubCategoryFromTabGroupPort:
      createLibRemoveSubCategoryFromTabGroupAdapter(),
    setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    storageChangePort: createChromeStorageChangeAdapter({
      getApi: () => getChromeApi(),
    }),
    tabGroupRepository: createChromeTabGroupRepository(port),
    urlRecordRepository: createChromeUrlRecordRepository(port),
    userSettingsRepository: createChromeUserSettingsRepository(port),
  }
}

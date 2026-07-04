import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike as ChromeApiLikeBase } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter'
import { createChromeMessagingAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import type { ChromeApiLike as ChromeMessagingApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import { createChromeStorageChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'
import { createSystemClock } from '@/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter'
import { createChromeCustomProjectRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeCustomProjectRepository'
import { createChromeDomainCategoryMappingRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategoryMappingRepository'
import { createChromeDomainCategorySettingsRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategorySettingsRepository'
import { createChromeMigrationAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeMigrationAdapter'
import { createChromeParentCategoryRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeParentCategoryRepository'
import { createLibRemoveSubCategoryFromTabGroupAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeRemoveSubCategoryFromTabGroupAdapter'
import { createLibSetCategoryKeywordsAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeSetCategoryKeywordsAdapter'
import {
  createChromeSavedTabsTabGroupReadAdapter,
  createChromeTabGroupRepository,
} from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeTabGroupRepository'
import { createChromeUrlRecordRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository'
import { getChromeGlobal } from '@/lib/browser/chrome-global'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import { createLibCategoriesCommandService } from './LibCategoriesCommandService'
import { createLibCategoryAssignmentPort } from './LibCategoryAssignmentPort'
import { createLibCustomProjectsCommandService } from './LibCustomProjectsCommandService'

export type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'

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
  readonly runtime?: ChromeMessagingApiLike['runtime']
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

const isChromeLike = (value: unknown): value is ChromeLike =>
  typeof value === 'object' && value !== null

const getChromeApi = (): ChromeLike | undefined => getChromeGlobal(isChromeLike)

const getChromeMessagingApi = (): ChromeMessagingApiLike | undefined => {
  const api = getChromeApi()
  return api?.runtime ? { runtime: api.runtime } : undefined
}

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
    clock: createSystemClock(),
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
      getApi: getChromeMessagingApi,
    }),
    notificationPort: createSonnerNotificationAdapter(),
    parentCategoryRepository: createChromeParentCategoryRepository(port),
    removeSubCategoryFromTabGroupPort:
      createLibRemoveSubCategoryFromTabGroupAdapter(),
    setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    storageChangePort: createChromeStorageChangeAdapter({
      getApi: () => getChromeApi(),
    }),
    savedTabsTabGroupReadPort: createChromeSavedTabsTabGroupReadAdapter(port),
    tabGroupRepository: createChromeTabGroupRepository(port),
    urlRecordRepository: createChromeUrlRecordRepository(port),
    userSettingsRepository: createChromeUserSettingsRepository(port),
  }
}

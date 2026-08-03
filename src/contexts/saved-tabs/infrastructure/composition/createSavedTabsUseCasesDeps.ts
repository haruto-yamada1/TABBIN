import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike as ChromeApiLikeBase } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter'
import { createChromeMessagingAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import type { ChromeApiLike as ChromeMessagingApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import { createChromeStorageChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'
import { createSystemClock } from '@/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
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
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import { createLibCategoriesCommandService } from './LibCategoriesCommandService'
import { createLibCategoryAssignmentPort } from './LibCategoryAssignmentPort'
import { createLibCustomProjectsCommandService } from './LibCustomProjectsCommandService'
import { getPersistenceStorageLocal } from './persistenceBootstrapRuntime'

export type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'

/**
 * `createSavedTabsUseCasesDeps` に渡せる任意設定。
 *
 * - `resolveActive` : `BrowserTabPort` 配下で開く新規タブを active にするかを
 *   実行時に解決する関数。presentation 層が `openUrlInBackground` 設定を
 *   ref 経由で読むために利用。未指定なら active 固定。
 */
export type CreateSavedTabsUseCasesDepsOptions = {
  readonly resolveActive?: () => boolean
}

type SavedTabsDomainStorageLocal = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly remove: (key: string) => Promise<void>
  readonly set: (value: Record<string, unknown>) => Promise<void>
}

type ChromeLike = ChromeApiLikeBase & {
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

const isChromeLike = (value: unknown): value is ChromeLike =>
  isObjectLike(value)

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
type SavedTabsUseCasesDepsFromStorageArgs = {
  readonly options: CreateSavedTabsUseCasesDepsOptions
  readonly domainLocal: SavedTabsDomainStorageLocal | null
  readonly settingsLocal: SavedTabsDomainStorageLocal | null
}

const createSavedTabsUseCasesDepsFromStorage = ({
  options,
  domainLocal,
  settingsLocal,
}: SavedTabsUseCasesDepsFromStorageArgs): SavedTabsUseCasesDeps => {
  if (!domainLocal || !settingsLocal) {
    warnMissingChromeStorage('createSavedTabsUseCasesDeps')
  }
  const domainPort = domainLocal
    ? {
        get: async (key: string) => domainLocal.get(key),
        remove: async (key: string) => domainLocal.remove(key),
        set: async (value: Record<string, unknown>) => domainLocal.set(value),
      }
    : null
  const settingsPort = settingsLocal
    ? {
        get: async (key: string) => settingsLocal.get(key),
        remove: async (key: string) => settingsLocal.remove(key),
        set: async (value: Record<string, unknown>) => settingsLocal.set(value),
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
    idGenerator: createSystemIdGenerator(),
    categoryAssignmentPort: createLibCategoryAssignmentPort({
      parentCategoryRepository:
        createChromeParentCategoryRepository(domainPort),
      tabGroupRepository: createChromeTabGroupRepository(domainPort),
    }),
    customProjectRepository: createChromeCustomProjectRepository(domainPort),
    customProjectsCommandService: createLibCustomProjectsCommandService(),
    domainCategoryMappingRepository:
      createChromeDomainCategoryMappingRepository(domainPort),
    domainCategorySettingsRepository:
      createChromeDomainCategorySettingsRepository(domainPort),
    migrationPort: createChromeMigrationAdapter(),
    messagingPort: createChromeMessagingAdapter({
      getApi: getChromeMessagingApi,
    }),
    notificationPort: createSonnerNotificationAdapter(),
    parentCategoryRepository: createChromeParentCategoryRepository(domainPort),
    removeSubCategoryFromTabGroupPort:
      createLibRemoveSubCategoryFromTabGroupAdapter(),
    setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    storageChangePort: createChromeStorageChangeAdapter({
      getApi: () => getChromeApi(),
    }),
    savedTabsTabGroupReadPort:
      createChromeSavedTabsTabGroupReadAdapter(domainPort),
    tabGroupRepository: createChromeTabGroupRepository(domainPort),
    urlRecordRepository: createChromeUrlRecordRepository(domainPort),
    userSettingsRepository: createChromeUserSettingsRepository(settingsPort),
  }
}

export const createSavedTabsUseCasesDeps = (
  options: CreateSavedTabsUseCasesDepsOptions = {},
): SavedTabsUseCasesDeps =>
  createSavedTabsUseCasesDepsFromStorage({
    options,
    domainLocal: getPersistenceStorageLocal(),
    settingsLocal: getChromeStorageLocal(),
  })

/**
 * Builds the already-selected legacy branch for the outer data-plane router.
 *
 * The raw Chrome port is intentional here: applying the legacy operation gate
 * again inside `PersistenceDataPlaneRouterService` would acquire the same
 * coordination barrier twice and preselect the route. Only the outer router is
 * allowed to choose this branch.
 */
export const createSelectedLegacySavedTabsUseCasesDeps = (
  options: CreateSavedTabsUseCasesDepsOptions = {},
): SavedTabsUseCasesDeps => {
  const storage = getChromeStorageLocal()
  // `storage.*` の直接呼び出しを保つことで、この composition ファイルが
  // machine-checked storage writer inventory (docs/architecture/current-storage-writer-inventory.md)
  // の mutation boundary として分類され続ける。wrapper を省略すると inventory 検証が壊れる。
  const selectedLegacyStorage = storage
    ? {
        get: async (key: string) => storage.get(key),
        remove: async (key: string) => storage.remove(key),
        set: async (value: Record<string, unknown>) => storage.set(value),
      }
    : null
  return createSavedTabsUseCasesDepsFromStorage({
    options,
    domainLocal: selectedLegacyStorage,
    settingsLocal: storage,
  })
}

import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '../../application/ports/BrowserWindowPort'
import type { CategoriesCommandService } from '../../application/ports/CategoriesCommandService'
import type { CustomProjectsCommandService } from '../../application/ports/CustomProjectsCommandService'
import type { MigrationPort } from '../../application/ports/MigrationPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import type { SetCategoryKeywordsPort } from '../../application/ports/SetCategoryKeywordsPort'
import type { StorageChangePort } from '../../application/ports/StorageChangePort'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { DomainCategoryMappingRepository } from '../../domain/repositories/DomainCategoryMappingRepository'
import type { DomainCategorySettingsRepository } from '../../domain/repositories/DomainCategorySettingsRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { UserSettingsRepository } from '../../domain/repositories/UserSettingsRepository'
import { createChromeBrowserTabAdapter } from '../browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '../browser/ChromeBrowserWindowAdapter'
import { createChromeStorageChangeAdapter } from '../browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '../browser/SonnerNotificationAdapter'
import { createChromeCustomProjectRepository } from '../persistence/chrome-storage/ChromeCustomProjectRepository'
import { createChromeDomainCategoryMappingRepository } from '../persistence/chrome-storage/ChromeDomainCategoryMappingRepository'
import { createChromeDomainCategorySettingsRepository } from '../persistence/chrome-storage/ChromeDomainCategorySettingsRepository'
import { createChromeMigrationAdapter } from '../persistence/chrome-storage/ChromeMigrationAdapter'
import { createChromeParentCategoryRepository } from '../persistence/chrome-storage/ChromeParentCategoryRepository'
import { createLibSetCategoryKeywordsAdapter } from '../persistence/chrome-storage/ChromeSetCategoryKeywordsAdapter'
import { createChromeTabGroupRepository } from '../persistence/chrome-storage/ChromeTabGroupRepository'
import { createChromeUrlRecordRepository } from '../persistence/chrome-storage/ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from '../persistence/chrome-storage/ChromeUserSettingsRepository'
import { createLibCategoriesCommandService } from './LibCategoriesCommandService'
import { createLibCustomProjectsCommandService } from './LibCustomProjectsCommandService'

/**
 * presentation / composition 層が repository と port を「テスト可能な形」で
 * 受け取るための依存バンドル。
 *
 * use-case ファクトリ (`create*UseCase`) へ直接このオブジェクトを分割して渡す。
 * ポートを `null` 許容にしないことで、未注入の依存で use-case が
 * 動作してしまう事故を防ぐ。
 */
export interface SavedTabsUseCasesDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly userSettingsRepository: UserSettingsRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly domainCategorySettingsRepository: DomainCategorySettingsRepository
  readonly setCategoryKeywordsPort: SetCategoryKeywordsPort
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
  readonly notificationPort: NotificationPort
  readonly storageChangePort: StorageChangePort
  readonly migrationPort: MigrationPort
  readonly categoriesCommandService: CategoriesCommandService
  readonly customProjectsCommandService: CustomProjectsCommandService
}

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

interface ChromeLike {
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

const getChromeApi = (): ChromeLike | undefined =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome

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
        get: (key: string) => local.get(key),
        remove: (key: string) => local.remove(key),
        set: (value: Record<string, unknown>) => local.set(value),
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
    customProjectRepository: createChromeCustomProjectRepository(port),
    customProjectsCommandService: createLibCustomProjectsCommandService(),
    domainCategoryMappingRepository:
      createChromeDomainCategoryMappingRepository(port),
    domainCategorySettingsRepository:
      createChromeDomainCategorySettingsRepository(port),
    migrationPort: createChromeMigrationAdapter(),
    notificationPort: createSonnerNotificationAdapter(),
    parentCategoryRepository: createChromeParentCategoryRepository(port),
    setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    storageChangePort: createChromeStorageChangeAdapter({
      getApi: () => getChromeApi(),
    }),
    tabGroupRepository: createChromeTabGroupRepository(port),
    urlRecordRepository: createChromeUrlRecordRepository(port),
    userSettingsRepository: createChromeUserSettingsRepository(port),
  }
}

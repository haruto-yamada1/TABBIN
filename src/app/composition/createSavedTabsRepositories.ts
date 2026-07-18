import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { DomainCategorySettingsRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategorySettingsRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'
import { getPersistenceStorageLocal } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { createChromeCustomProjectRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeCustomProjectRepository'
import { createChromeDomainCategoryMappingRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategoryMappingRepository'
import { createChromeDomainCategorySettingsRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategorySettingsRepository'
import { createChromeParentCategoryRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeParentCategoryRepository'
import { createChromeTabGroupRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeTabGroupRepository'
import type { ChromeStorageLocalPort } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository'
import { createChromeUrlRecordRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository'
import { createChromeUserSettingsRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

/**
 * `src/app/composition/` レベルで組み立てる、saved-tabs 用
 * `Repository` 実装のバンドル。
 *
 * 各 `Chrome*Repository` は `domain/repositories/` の interface だけを
 * 公開する。移行対象の domain data は PersistenceBootstrap gate を通し、
 * `userSettings` は cutover 後も authority を保つ settings port へ分離する。
 * `chrome.storage.local`
 * が利用できない環境で repository 関数を呼び出すと
 * `SavedTabsRepositoryUnavailableError` が投げられる。
 */
export type SavedTabsRepositories = {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly userSettingsRepository: UserSettingsRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly domainCategorySettingsRepository: DomainCategorySettingsRepository
}

const createChromeStorageLocalPort = (
  local: typeof chrome.storage.local | null,
): ChromeStorageLocalPort | null => {
  if (!local) {
    return null
  }
  return {
    get: async (key) => local.get(key),
    remove: async (key) => local.remove(key),
    set: async (value) => local.set(value),
  }
}

/**
 * `chrome.storage.local` ベースの saved-tabs 用 repository 群を生成する。
 *
 * gated domain port は 6 つの domain repository へ共有し、raw settings port
 * は UserSettingsRepository だけへ渡す。
 *
 * `chrome.storage.local` が無い環境（Storybook / テストなど chrome 不在）で
 * 呼び出された場合、各 repository 関数は
 * `SavedTabsRepositoryUnavailableError` を投げる。presentation 層は
 * loading 状態や初期化エラーとしてこれをハンドルする想定。
 *
 * @example
 * ```ts
 * const repositories = createSavedTabsRepositories()
 * const groups = await repositories.tabGroupRepository.findAll()
 * ```
 */
export const createSavedTabsRepositories = (): SavedTabsRepositories => {
  const domainPort = createChromeStorageLocalPort(getPersistenceStorageLocal())
  const settingsPort = createChromeStorageLocalPort(getChromeStorageLocal())
  return {
    customProjectRepository: createChromeCustomProjectRepository(domainPort),
    domainCategoryMappingRepository:
      createChromeDomainCategoryMappingRepository(domainPort),
    domainCategorySettingsRepository:
      createChromeDomainCategorySettingsRepository(domainPort),
    parentCategoryRepository: createChromeParentCategoryRepository(domainPort),
    tabGroupRepository: createChromeTabGroupRepository(domainPort),
    urlRecordRepository: createChromeUrlRecordRepository(domainPort),
    userSettingsRepository: createChromeUserSettingsRepository(settingsPort),
  }
}

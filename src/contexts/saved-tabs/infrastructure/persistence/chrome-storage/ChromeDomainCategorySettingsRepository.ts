import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import type {
  DomainCategorySettings,
  SubCategoryKeyword,
} from '@/types/storage'

import type { DomainCategorySettingsRepository } from '../../../domain/repositories/DomainCategorySettingsRepository'
import { DOMAIN_CATEGORY_SETTINGS_KEY } from './savedTabsStorageKeys'
import { DomainCategorySettingsRawSchema } from './savedTabsStorageSchema'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'

const getDefaultPort = (): ChromeStorageLocalPort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: (key) => local.get(key),
    remove: (key) => local.remove(key),
    set: (value) => local.set(value),
  }
}

const parseSettings = (
  raw: unknown,
): readonly DomainCategorySettings[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const valid: DomainCategorySettings[] = []
  for (const item of raw) {
    const parsed = DomainCategorySettingsRawSchema.safeParse(item)
    if (parsed.success) {
      valid.push({
        categoryKeywords: parsed.data.categoryKeywords as SubCategoryKeyword[],
        domain: parsed.data.domain,
        subCategories: parsed.data.subCategories,
      })
    }
  }
  return valid
}

const createChromeDomainCategorySettingsRepositoryImpl = (
  port: ChromeStorageLocalPort,
): DomainCategorySettingsRepository => {
  const findAll = async (): Promise<readonly DomainCategorySettings[]> => {
    const result = await port.get(DOMAIN_CATEGORY_SETTINGS_KEY)
    return parseSettings(result[DOMAIN_CATEGORY_SETTINGS_KEY])
  }

  const saveAll = async (
    settings: readonly DomainCategorySettings[],
  ): Promise<void> => {
    await port.set({ [DOMAIN_CATEGORY_SETTINGS_KEY]: settings })
  }

  return { findAll, saveAll }
}

/**
 * `chrome.storage.local` 上の `DOMAIN_CATEGORY_SETTINGS_KEY` を
 * `DomainCategorySettings` 永続化用に使う
 * `DomainCategorySettingsRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/categories.getDomainCategorySettings` /
 * `updateDomainCategorySettings` の DDD 化。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeDomainCategorySettingsRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): DomainCategorySettingsRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeDomainCategorySettingsRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeDomainCategorySettingsRepository を初期化できません',
    )
  }
  return createChromeDomainCategorySettingsRepositoryImpl(port)
}

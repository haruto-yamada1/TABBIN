import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import { toStorageDomainCategorySettings } from '../../../application/mappers/SavedTabsDtosMapper'
import type { DomainCategorySettingsDto } from '../../../domain/dto/DomainCategorySettingsDto'
import type { DomainCategorySettingsRepository } from '../../../domain/repositories/DomainCategorySettingsRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { DOMAIN_CATEGORY_SETTINGS_KEY } from './savedTabsStorageKeys'
import { DomainCategorySettingsRawSchema } from './savedTabsStorageSchema'

const getDefaultPort = (): ChromeStorageLocalPort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: async (key) => local.get(key),
    remove: async (key) => local.remove(key),
    set: async (value) => local.set(value),
  }
}

const parseSettings = (raw: unknown): readonly DomainCategorySettingsDto[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const valid: DomainCategorySettingsDto[] = []
  for (const item of raw) {
    const parsed = DomainCategorySettingsRawSchema.safeParse(item)
    if (parsed.success) {
      valid.push({
        categoryKeywords: parsed.data.categoryKeywords.map((keyword) => ({
          categoryName: keyword.categoryName,
          keywords: [...keyword.keywords],
        })),
        domain: parsed.data.domain,
        subCategories: [...parsed.data.subCategories],
      })
    }
  }
  return valid
}

const createChromeDomainCategorySettingsRepositoryImpl = (
  port: ChromeStorageLocalPort,
): DomainCategorySettingsRepository => {
  const findAll = async (): Promise<readonly DomainCategorySettingsDto[]> => {
    const result = await port.get(DOMAIN_CATEGORY_SETTINGS_KEY)
    return parseSettings(result[DOMAIN_CATEGORY_SETTINGS_KEY])
  }

  const saveAll = async (
    settings: readonly DomainCategorySettingsDto[],
  ): Promise<void> => {
    const storage = toStorageDomainCategorySettings(settings)
    await port.set({ [DOMAIN_CATEGORY_SETTINGS_KEY]: storage })
  }

  return { findAll, saveAll }
}

/**
 * `chrome.storage.local` 上の `DOMAIN_CATEGORY_SETTINGS_KEY` を
 * `DomainCategorySettingsDto` 永続化用に使う
 * `DomainCategorySettingsRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/categories.getDomainCategorySettings` /
 * `updateDomainCategorySettings` の DDD 化。
 *
 * `@/types/storage.DomainCategorySettings` / `SubCategoryKeyword` を
 * 直接扱わず、domain DTO `DomainCategorySettingsDto` だけを domain 層
 * とやりとりする (issue #511)。
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

// re-export して他モジュールが `toDomainCategorySettingsDtoArray` を
// 利用できるよう公開する。

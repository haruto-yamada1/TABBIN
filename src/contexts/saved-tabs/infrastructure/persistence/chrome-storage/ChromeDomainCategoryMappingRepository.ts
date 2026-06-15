import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import type { DomainParentCategoryMapping } from '@/types/storage'

import type { DomainCategoryMappingRepository } from '../../../domain/repositories/DomainCategoryMappingRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { DOMAIN_CATEGORY_MAPPINGS_KEY } from './savedTabsStorageKeys'
import { DomainCategoryMappingRawSchema } from './savedTabsStorageSchema'

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

const parseMappings = (
  raw: unknown,
): readonly DomainParentCategoryMapping[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const valid: DomainParentCategoryMapping[] = []
  for (const item of raw) {
    const parsed = DomainCategoryMappingRawSchema.safeParse(item)
    if (parsed.success) {
      valid.push({
        categoryId: parsed.data.categoryId,
        domain: parsed.data.domain,
      })
    }
  }
  return valid
}

const createChromeDomainCategoryMappingRepositoryImpl = (
  port: ChromeStorageLocalPort,
): DomainCategoryMappingRepository => {
  const findAll = async (): Promise<readonly DomainParentCategoryMapping[]> => {
    const result = await port.get(DOMAIN_CATEGORY_MAPPINGS_KEY)
    return parseMappings(result[DOMAIN_CATEGORY_MAPPINGS_KEY])
  }

  const saveAll = async (
    mappings: readonly DomainParentCategoryMapping[],
  ): Promise<void> => {
    await port.set({ [DOMAIN_CATEGORY_MAPPINGS_KEY]: mappings })
  }

  return { findAll, saveAll }
}

/**
 * `chrome.storage.local` 上の `DOMAIN_CATEGORY_MAPPINGS_KEY` を
 * `DomainParentCategoryMapping` 永続化用に使う
 * `DomainCategoryMappingRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/categories.getDomainCategoryMappings` /
 * `updateDomainCategoryMapping` の DDD 化。`findAll` は safeParse で
 * 不正レコードを除外して返し、`saveAll` は与えられた配列をそのまま保存する。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeDomainCategoryMappingRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): DomainCategoryMappingRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeDomainCategoryMappingRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeDomainCategoryMappingRepository を初期化できません',
    )
  }
  return createChromeDomainCategoryMappingRepositoryImpl(port)
}

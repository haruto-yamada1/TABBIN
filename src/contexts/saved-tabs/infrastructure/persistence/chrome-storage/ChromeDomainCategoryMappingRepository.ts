import { toStorageDomainCategoryMappings } from '@/contexts/saved-tabs/application/mappers/SavedTabsDtosMapper'
import type { DomainCategoryMappingDto } from '@/contexts/saved-tabs/domain/dto/DomainCategoryMappingDto'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

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
    get: async (key) => local.get(key),
    remove: async (key) => local.remove(key),
    set: async (value) => local.set(value),
  }
}

const parseMappings = (raw: unknown): readonly DomainCategoryMappingDto[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const valid: DomainCategoryMappingDto[] = []
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
  const findAll = async (): Promise<readonly DomainCategoryMappingDto[]> => {
    const result = await port.get(DOMAIN_CATEGORY_MAPPINGS_KEY)
    return parseMappings(result[DOMAIN_CATEGORY_MAPPINGS_KEY])
  }

  const saveAll = async (
    mappings: readonly DomainCategoryMappingDto[],
  ): Promise<void> => {
    const storage = toStorageDomainCategoryMappings(mappings)
    await port.set({ [DOMAIN_CATEGORY_MAPPINGS_KEY]: storage })
  }

  return { findAll, saveAll }
}

/**
 * `chrome.storage.local` 上の `DOMAIN_CATEGORY_MAPPINGS_KEY` を
 * `DomainCategoryMappingDto` 永続化用に使う
 * `DomainCategoryMappingRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/categories.getDomainCategoryMappings` /
 * `updateDomainCategoryMapping` の DDD 化。`findAll` は safeParse で
 * 不正レコードを除外して DTO として返し、`saveAll` は mapper 経由で
 * storage 形へ逆変換して書き込む。
 *
 * `@/types/storage.DomainParentCategoryMapping` を直接扱わず、
 * domain DTO `DomainCategoryMappingDto` だけを domain 層とやりとり
 * する (issue #511)。
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

// re-export して他モジュールが `toDomainCategoryMappingDtoArray` を
// 利用できるよう公開する。

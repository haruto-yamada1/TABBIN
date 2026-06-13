import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { ParentCategory } from '../../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../../domain/repositories/ParentCategoryRepository'
import type { ParentCategoryId } from '../../../domain/value-objects/ParentCategoryId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { PARENT_CATEGORIES_KEY } from './savedTabsStorageKeys'
import type { ParentCategoryRaw } from './savedTabsStorageSchema'

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

const createChromeParentCategoryRepositoryImpl = (
  port: ChromeStorageLocalPort,
): ParentCategoryRepository => {
  const findAll = async (): Promise<readonly ParentCategory[]> => {
    const result = await port.get(PARENT_CATEGORIES_KEY)
    const raw = result[PARENT_CATEGORIES_KEY]
    return ChromeSavedTabsStorageMapper.parseParentCategories(raw)
  }

  const findById = async (
    id: ParentCategoryId,
  ): Promise<ParentCategory | null> => {
    const idString = ChromeSavedTabsStorageMapper.parentCategoryIdToString(id)
    const all = await findAll()
    return all.find((category) => category.id === idString) ?? null
  }

  const saveAll = async (
    categories: readonly ParentCategory[],
  ): Promise<void> => {
    const raws: ParentCategoryRaw[] = categories.map((category) =>
      ChromeSavedTabsStorageMapper.toParentCategoryRaw(category),
    )
    await port.set({ [PARENT_CATEGORIES_KEY]: raws })
  }

  const removeByIds = async (
    ids: readonly ParentCategoryId[],
  ): Promise<void> => {
    if (ids.length === 0) {
      return
    }
    const idSet = new Set(ids.map((id) => id))
    const all = await findAll()
    const remaining = all.filter((category) => !idSet.has(category.id))
    if (remaining.length === all.length) {
      return
    }
    await saveAll(remaining)
  }

  return { findAll, findById, removeByIds, saveAll }
}

/**
 * `chrome.storage.local` 上の `PARENT_CATEGORIES_KEY` を
 * `ParentCategory` 永続化用に使う `ParentCategoryRepository` 実装を生成する。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeParentCategoryRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): ParentCategoryRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeParentCategoryRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeParentCategoryRepository を初期化できません',
    )
  }
  return createChromeParentCategoryRepositoryImpl(port)
}

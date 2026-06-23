import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { PARENT_CATEGORIES_KEY } from './savedTabsStorageKeys'
import { ParentCategoryRawSchema } from './savedTabsStorageSchema'
import type { ParentCategoryRaw } from './savedTabsStorageSchema'

type ChromeParentCategoryStoragePort = Pick<
  ChromeStorageLocalPort,
  'get' | 'set'
>

const getDefaultPort = (): ChromeParentCategoryStoragePort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: async (key) => local.get(key),
    set: async (value) => local.set(value),
  }
}

const createChromeParentCategoryRepositoryImpl = (
  port: ChromeParentCategoryStoragePort,
): ParentCategoryRepository => {
  const findAll = async (): Promise<readonly ParentCategory[]> => {
    const result = await port.get(PARENT_CATEGORIES_KEY)
    const raw = result[PARENT_CATEGORIES_KEY]
    return ChromeSavedTabsStorageMapper.parseParentCategories(raw)
  }

  const findAllRawParentCategories = async (): Promise<ParentCategoryRaw[]> => {
    const result = await port.get(PARENT_CATEGORIES_KEY)
    const raw = result[PARENT_CATEGORIES_KEY]
    if (!Array.isArray(raw)) {
      return []
    }
    // 1 要素ずつ safeParse。配列全体のパースだと 1 件の不正で全体が
    // 失敗して既存ユーザーデータが失われるため。
    const valid: ParentCategoryRaw[] = []
    for (const item of raw) {
      const parsed = ParentCategoryRawSchema.safeParse(item)
      if (parsed.success) {
        valid.push(parsed.data)
      }
    }
    return valid
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
    // 既存 raw を取得し、entity と merge する。`domainNames` は既存ユーザ
    // ーデータが schemeful 形式（`https://example.com`）で書き込まれている
    // ケースがあり、entity 化時に hostname 形式へ正規化されるため、
    // 書き戻しで original 側の schemeful 形式を持ち越す必要がある
    // （issue #501 review P1 と同根の問題）。
    const existingRaws = await findAllRawParentCategories()
    const originalById = new Map<string, ParentCategoryRaw>()
    for (const original of existingRaws) {
      originalById.set(original.id, original)
    }
    const raws: ParentCategoryRaw[] = categories.map((category) =>
      ChromeSavedTabsStorageMapper.toParentCategoryRaw(
        category,
        originalById.get(category.id),
      ),
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
  port: ChromeParentCategoryStoragePort | null = getDefaultPort(),
): ParentCategoryRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeParentCategoryRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeParentCategoryRepository を初期化できません',
    )
  }
  return createChromeParentCategoryRepositoryImpl(port)
}

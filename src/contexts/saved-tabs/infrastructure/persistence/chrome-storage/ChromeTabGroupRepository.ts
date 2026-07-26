import type { SavedTabsTabGroupReadPort } from '@/contexts/saved-tabs/application/ports/SavedTabsTabGroupReadPort'
import type { SavedTabRawSummaryDto } from '@/contexts/saved-tabs/domain/dto/SavedTabRawSummaryDto'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'
import { warnMissingChromeStorage } from '@/lib/browser/chrome-storage'

import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SAVED_TABS_KEY } from './savedTabsStorageKeys'
import { SavedTabRawSchema } from './savedTabsStorageSchema'
import type { SavedTabRaw } from './savedTabsStorageSchema'

type ChromeTabGroupStoragePort = Pick<ChromeStorageLocalPort, 'get' | 'set'>

const findAllRawTabGroups = async (
  port: ChromeTabGroupStoragePort,
): Promise<SavedTabRaw[]> => {
  const result = await port.get(SAVED_TABS_KEY)
  const raw = result[SAVED_TABS_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  // 1 要素ずつ safeParse する。`SavedTabRawArraySchema.safeParse(raw)` を
  // 使うと配列全体に対する単一の zod パースになり、不正要素が 1 つでも
  // 含まれていると全体が failure になってしまい、merge 元データが失われる。
  // ここは「有効要素だけ集める」挙動が必要なため要素ごとにパースする。
  const valid: SavedTabRaw[] = []
  for (const item of raw) {
    const parsed = SavedTabRawSchema.safeParse(item)
    if (parsed.success) {
      valid.push(parsed.data)
    }
  }
  return valid
}

const createChromeTabGroupRepositoryImpl = (
  port: ChromeTabGroupStoragePort,
): TabGroupRepository => {
  const findAll = async (): Promise<readonly TabGroup[]> => {
    const result = await port.get(SAVED_TABS_KEY)
    const raw = result[SAVED_TABS_KEY]
    return ChromeSavedTabsStorageMapper.parseTabGroups(raw)
  }

  const findById = async (id: TabGroupId): Promise<TabGroup | null> => {
    const idString = ChromeSavedTabsStorageMapper.tabGroupIdToString(id)
    const all = await findAll()
    return all.find((group) => group.id === idString) ?? null
  }

  const findRawDomainById = async (id: TabGroupId): Promise<string | null> => {
    const idString = ChromeSavedTabsStorageMapper.tabGroupIdToString(id)
    const raws = await findAllRawTabGroups(port)
    const raw = raws.find((entry) => entry.id === idString)
    return raw?.domain ?? null
  }

  const findRawTabGroupById = async (
    id: TabGroupId,
  ): Promise<SavedTabRawSummaryDto | null> => {
    const idString = ChromeSavedTabsStorageMapper.tabGroupIdToString(id)
    const raws = await findAllRawTabGroups(port)
    const raw = raws.find((entry) => entry.id === idString)
    if (!raw) {
      return null
    }
    return {
      categoryKeywords: (raw.categoryKeywords ?? []).map((keyword) => ({
        categoryName: keyword.categoryName,
        keywords: [...keyword.keywords],
      })),
      domain: raw.domain,
      id: raw.id,
      parentCategoryId: raw.parentCategoryId,
      subCategories: [...(raw.subCategories ?? [])],
    }
  }

  const saveAll = async (groups: readonly TabGroup[]): Promise<void> => {
    // 既存ユーザーデータ（`urls`, `urlSubCategories`, `subCategories`,
    // `categoryKeywords`, `subCategoryOrder`, `subCategoryOrderWithUncategorized`）
    // を破壊しないため、書き込み前に既存 raw を取得し、entity と merge する。
    const existingRaws = await findAllRawTabGroups(port)
    const originalById = new Map<string, SavedTabRaw>()
    for (const original of existingRaws) {
      originalById.set(original.id, original)
    }
    const raws: SavedTabRaw[] = groups.map((group) =>
      ChromeSavedTabsStorageMapper.toSavedTabRaw(
        group,
        originalById.get(group.id),
      ),
    )
    await port.set({ [SAVED_TABS_KEY]: raws })
  }

  const removeByIds = async (ids: readonly TabGroupId[]): Promise<void> => {
    if (ids.length === 0) {
      return
    }
    const idSet = new Set(ids.map((id) => id))
    const all = await findAll()
    const remaining = all.filter((group) => !idSet.has(group.id))
    if (remaining.length === all.length) {
      return
    }
    await saveAll(remaining)
  }

  return {
    findAll,
    findById,
    findRawDomainById,
    findRawTabGroupById,
    removeByIds,
    saveAll,
  }
}

/**
 * `chrome.storage.local` 上の `SAVED_TABS_KEY` を `TabGroup` 永続化用に使う
 * `TabGroupRepository` 実装を生成する。
 *
 * Rich な補助フィールド（`urlSubCategories` / `subCategories` /
 * `categoryKeywords` / `subCategoryOrder` /
 * `subCategoryOrderWithUncategorized` / `urls`）は domain entity には載らないが、
 * `saveAll` で既存 raw データから持ち越して `urlIds` の集合に合わせて整合性を
 * 取りつつ保存する。これによりユーザーの既存保存データを破壊しない。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeTabGroupRepository = (
  port: ChromeTabGroupStoragePort | null,
): TabGroupRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeTabGroupRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeTabGroupRepository を初期化できません',
    )
  }
  return createChromeTabGroupRepositoryImpl(port)
}

export const createChromeSavedTabsTabGroupReadAdapter = (
  port: ChromeTabGroupStoragePort | null,
): SavedTabsTabGroupReadPort => {
  if (!port) {
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため saved-tabs read port を初期化できません',
    )
  }
  return {
    findAll: async () =>
      (await findAllRawTabGroups(port)).map((group) => ({
        ...group,
        ...(group.urlIds ? { urlIds: [...group.urlIds] } : {}),
        ...(group.urls ? { urls: group.urls.map((url) => ({ ...url })) } : {}),
        ...(group.urlSubCategories
          ? { urlSubCategories: { ...group.urlSubCategories } }
          : {}),
        ...(group.subCategories
          ? { subCategories: [...group.subCategories] }
          : {}),
        ...(group.categoryKeywords
          ? {
              categoryKeywords: group.categoryKeywords.map((entry) => ({
                categoryName: entry.categoryName,
                keywords: [...entry.keywords],
              })),
            }
          : {}),
        ...(group.subCategoryOrder
          ? { subCategoryOrder: [...group.subCategoryOrder] }
          : {}),
        ...(group.subCategoryOrderWithUncategorized
          ? {
              subCategoryOrderWithUncategorized: [
                ...group.subCategoryOrderWithUncategorized,
              ],
            }
          : {}),
      })),
  }
}

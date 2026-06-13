import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { TabGroup } from '../../../domain/entities/TabGroup'
import type { TabGroupRepository } from '../../../domain/repositories/TabGroupRepository'
import type { TabGroupId } from '../../../domain/value-objects/TabGroupId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SAVED_TABS_KEY } from './savedTabsStorageKeys'
import type { SavedTabRaw } from './savedTabsStorageSchema'

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

const createChromeTabGroupRepositoryImpl = (
  port: ChromeStorageLocalPort,
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

  const saveAll = async (groups: readonly TabGroup[]): Promise<void> => {
    const raws: SavedTabRaw[] = groups.map((group) =>
      ChromeSavedTabsStorageMapper.toSavedTabRaw(group),
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

  return { findAll, findById, removeByIds, saveAll }
}

/**
 * `chrome.storage.local` 上の `SAVED_TABS_KEY` を `TabGroup` 永続化用に使う
 * `TabGroupRepository` 実装を生成する。
 *
 * Rich な補助フィールド（`urlSubCategories` / `subCategories` /
 * `categoryKeywords` / `subCategoryOrder` /
 * `subCategoryOrderWithUncategorized` / `urls`）は現時点では永続化対象外。
 * 既存 `src/lib/storage/tabs.ts` を併用するか、別 issue の use-case 化で対応する。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeTabGroupRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): TabGroupRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeTabGroupRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeTabGroupRepository を初期化できません',
    )
  }
  return createChromeTabGroupRepositoryImpl(port)
}

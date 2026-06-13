import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { CustomProject } from '../../../domain/entities/CustomProject'
import type { CustomProjectRepository } from '../../../domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '../../../domain/value-objects/CustomProjectId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { CUSTOM_PROJECTS_KEY } from './savedTabsStorageKeys'
import { CustomProjectRawArraySchema } from './savedTabsStorageSchema'
import type { CustomProjectRaw } from './savedTabsStorageSchema'

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

const findAllRawCustomProjects = async (
  port: ChromeStorageLocalPort,
): Promise<CustomProjectRaw[]> => {
  const result = await port.get(CUSTOM_PROJECTS_KEY)
  const raw = result[CUSTOM_PROJECTS_KEY]
  const parsed = CustomProjectRawArraySchema.safeParse(raw)
  if (!parsed.success) {
    return []
  }
  return [...parsed.data]
}

const createChromeCustomProjectRepositoryImpl = (
  port: ChromeStorageLocalPort,
): CustomProjectRepository => {
  const findAll = async (): Promise<readonly CustomProject[]> => {
    const result = await port.get(CUSTOM_PROJECTS_KEY)
    const raw = result[CUSTOM_PROJECTS_KEY]
    return ChromeSavedTabsStorageMapper.parseCustomProjects(raw)
  }

  const findById = async (
    id: CustomProjectId,
  ): Promise<CustomProject | null> => {
    const idString = ChromeSavedTabsStorageMapper.customProjectIdToString(id)
    const all = await findAll()
    return all.find((project) => project.id === idString) ?? null
  }

  const saveAll = async (projects: readonly CustomProject[]): Promise<void> => {
    // 既存ユーザーデータ（`projectKeywords`, `urls`, `urlMetadata`,
    // `categoryOrder`）を破壊しないため、書き込み前に既存 raw を取得し、
    // entity と merge する。
    const existingRaws = await findAllRawCustomProjects(port)
    const originalById = new Map<string, CustomProjectRaw>()
    for (const original of existingRaws) {
      originalById.set(original.id, original)
    }
    const raws: CustomProjectRaw[] = projects.map((project) =>
      ChromeSavedTabsStorageMapper.toCustomProjectRaw(
        project,
        originalById.get(project.id),
      ),
    )
    await port.set({ [CUSTOM_PROJECTS_KEY]: raws })
  }

  const removeByIds = async (
    ids: readonly CustomProjectId[],
  ): Promise<void> => {
    if (ids.length === 0) {
      return
    }
    const idSet = new Set(ids.map((id) => id))
    const all = await findAll()
    const remaining = all.filter((project) => !idSet.has(project.id))
    if (remaining.length === all.length) {
      return
    }
    await saveAll(remaining)
  }

  return { findAll, findById, removeByIds, saveAll }
}

/**
 * `chrome.storage.local` 上の `CUSTOM_PROJECTS_KEY` を
 * `CustomProject` 永続化用に使う `CustomProjectRepository` 実装を生成する。
 *
 * Rich な補助フィールド（`projectKeywords` / `urls` / `urlMetadata` /
 * `categoryOrder`）は domain entity には載らないが、`saveAll` で既存 raw
 * データから持ち越して `urlIds` の集合に合わせて整合性を取りつつ保存する。
 * これによりユーザーの既存保存データを破壊しない。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeCustomProjectRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): CustomProjectRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeCustomProjectRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeCustomProjectRepository を初期化できません',
    )
  }
  return createChromeCustomProjectRepositoryImpl(port)
}

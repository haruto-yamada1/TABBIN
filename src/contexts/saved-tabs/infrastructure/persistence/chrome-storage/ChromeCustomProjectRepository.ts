import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'
import { warnMissingChromeStorage } from '@/lib/browser/chrome-storage'

import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import {
  CUSTOM_PROJECT_ORDER_KEY,
  CUSTOM_PROJECTS_KEY,
} from './savedTabsStorageKeys'
import { CustomProjectRawSchema } from './savedTabsStorageSchema'
import type { CustomProjectRaw } from './savedTabsStorageSchema'

type ChromeCustomProjectStoragePort = Pick<
  ChromeStorageLocalPort,
  'get' | 'set'
>

const findAllRawCustomProjects = async (
  port: ChromeCustomProjectStoragePort,
): Promise<CustomProjectRaw[]> => {
  const result = await port.get(CUSTOM_PROJECTS_KEY)
  const raw = result[CUSTOM_PROJECTS_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  // 1 要素ずつ safeParse する。`CustomProjectRawArraySchema.safeParse(raw)` を
  // 使うと配列全体に対する単一の zod パースになり、不正要素が 1 つでも
  // 含まれていると全体が failure になってしまい、merge 元データが失われる。
  const valid: CustomProjectRaw[] = []
  for (const item of raw) {
    const parsed = CustomProjectRawSchema.safeParse(item)
    if (parsed.success) {
      valid.push(parsed.data)
    }
  }
  return valid
}

/**
 * `CUSTOM_PROJECT_ORDER_KEY` の生値を `CustomProjectId[]` へ詰め替える。
 *
 * - 非配列 / 配列でも要素が文字列以外 / 空文字・空白のみはスキップする。
 * - ドメイン層で `createCustomProjectId` が空文字を拒否するため、parse
 *   時点で空文字を除外しないと repository 境界で例外が漏れる。
 */
const parseCustomProjectOrder = (raw: unknown): readonly CustomProjectId[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: CustomProjectId[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue
    }
    const trimmedItem = item.trim()
    if (trimmedItem.length === 0 || seen.has(trimmedItem)) {
      continue
    }
    seen.add(trimmedItem)
    result.push(createCustomProjectId(trimmedItem))
  }
  return result
}

const createChromeCustomProjectRepositoryImpl = (
  port: ChromeCustomProjectStoragePort,
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

  const findOrder = async (): Promise<readonly CustomProjectId[]> => {
    const result = await port.get(CUSTOM_PROJECT_ORDER_KEY)
    return parseCustomProjectOrder(result[CUSTOM_PROJECT_ORDER_KEY])
  }

  const saveOrder = async (
    order: readonly CustomProjectId[],
  ): Promise<void> => {
    // ブランド型を剥いで素の string[] として保存する。重複や空文字は
    // parse 側で弾いているためここでは素直に unwrap するだけで十分。
    const plain: string[] = order.map((id) =>
      ChromeSavedTabsStorageMapper.customProjectIdToString(id),
    )
    await port.set({ [CUSTOM_PROJECT_ORDER_KEY]: plain })
  }

  const findAllRaw = async (): Promise<readonly CustomProjectRawSnapshot[]> => {
    return findAll()
  }

  const restoreAllRaw = async (
    raws: readonly CustomProjectRawSnapshot[],
  ): Promise<void> => {
    await saveAll(raws)
  }

  return {
    findAll,
    findAllRaw,
    findById,
    findOrder,
    removeByIds,
    restoreAllRaw,
    saveAll,
    saveOrder,
  }
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
 * `findOrder` / `saveOrder` は `CUSTOM_PROJECT_ORDER_KEY`（旧
 * `customProjectOrder`）を読み書きする。`order` は `CustomProject`
 * 集合とは独立した表示用並び順情報で、`CustomProject` が storage 上から
 * 消えてもエントリ自体は残ってよい。presentation 層は order を
 * stable sort の手掛かりとして扱い、未知 ID の扱いは view-model 側の
 * 責務とする（issue #487 で use-case 経由での復元を保証）。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeCustomProjectRepository = (
  port: ChromeCustomProjectStoragePort | null,
): CustomProjectRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeCustomProjectRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeCustomProjectRepository を初期化できません',
    )
  }
  return createChromeCustomProjectRepositoryImpl(port)
}

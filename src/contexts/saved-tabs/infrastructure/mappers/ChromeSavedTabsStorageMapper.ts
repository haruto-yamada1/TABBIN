import { createCustomProject } from '../../domain/entities/CustomProject'
import type { CustomProject } from '../../domain/entities/CustomProject'
import { createParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import { createTabGroup } from '../../domain/entities/TabGroup'
import type { TabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { UrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectId } from '../../domain/value-objects/CustomProjectId'
import type { DomainName } from '../../domain/value-objects/DomainName'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { TabGroupId } from '../../domain/value-objects/TabGroupId'
import type { UrlRecordId } from '../../domain/value-objects/UrlRecordId'
import {
  CustomProjectRawSchema,
  ParentCategoryRawSchema,
  SavedTabRawSchema,
  UrlRecordRawSchema,
} from '../persistence/chrome-storage/savedTabsStorageSchema'
import type {
  CustomProjectRaw,
  ParentCategoryRaw,
  SavedTabRaw,
  UrlRecordRaw,
} from '../persistence/chrome-storage/savedTabsStorageSchema'

/**
 * `chrome.storage.local` の生データ ↔ `saved-tabs` domain entity の変換口。
 *
 * 役割:
 * - 生データの `unknown` 境界を Zod schema (`savedTabsStorageSchema`) で検証する。
 * - 検証済みの生データを domain の factory (`createTabGroup` / `createUrlRecord` /
 *   `createParentCategory` / `createCustomProject`) に渡し、entity 化する。
 * - entity 化で失敗（`SavedTabsDomainError`）したレコードは捨てて呼び出し側へ
 *   `null` を返し、repository 実装側で警告ログを出せるようにする。
 * - 既存 `src/lib/storage/*` と同じ chrome.storage 形式を読み書きする。
 *
 * Rich な補助フィールド（`urlSubCategories` / `subCategories` /
 * `categoryKeywords` / `subCategoryOrder` など）は domain entity には存在しない
 * ため、現時点では mapper で読み捨てる（次 issue で use-case 化と併せて再設計）。
 */

const isSavedTabsDomainError = (
  error: unknown,
): error is SavedTabsDomainError => error instanceof SavedTabsDomainError

/**
 * 既存 chrome.storage では `domain` フィールドに `https://example.com` の
 * ような URL 形式が入っていた。新しい domain `DomainName` は hostname
 * のみを受け付けるので、URL 形式なら hostname を取り出して渡す。
 *
 * パース失敗時は入力をそのまま返す（後段の `createDomainName` で再度弾く）。
 */
const normalizeDomainField = (value: string): string => {
  if (!value.includes('://')) {
    return value
  }
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

const toTabGroupFromRaw = (raw: SavedTabRaw): TabGroup | null => {
  try {
    return createTabGroup({
      domain: normalizeDomainField(raw.domain),
      id: raw.id,
      parentCategoryId: raw.parentCategoryId,
      savedAt: raw.savedAt,
      urlIds: raw.urlIds ?? [],
    })
  } catch (error) {
    if (isSavedTabsDomainError(error)) {
      return null
    }
    throw error
  }
}

const toUrlRecordFromRaw = (raw: UrlRecordRaw): UrlRecord | null => {
  try {
    return createUrlRecord({
      favIconUrl: raw.favIconUrl,
      id: raw.id,
      savedAt: raw.savedAt,
      title: raw.title,
      url: raw.url,
    })
  } catch (error) {
    if (isSavedTabsDomainError(error)) {
      return null
    }
    throw error
  }
}

const toParentCategoryFromRaw = (
  raw: ParentCategoryRaw,
): ParentCategory | null => {
  try {
    return createParentCategory({
      domainNames: raw.domainNames.map((name) => normalizeDomainField(name)),
      domains: raw.domains,
      id: raw.id,
      name: raw.name,
    })
  } catch (error) {
    if (isSavedTabsDomainError(error)) {
      return null
    }
    throw error
  }
}

const toCustomProjectFromRaw = (
  raw: CustomProjectRaw,
): CustomProject | null => {
  try {
    return createCustomProject({
      categories: raw.categories,
      createdAt: raw.createdAt,
      id: raw.id,
      name: raw.name,
      updatedAt: raw.updatedAt,
      urlIds: raw.urlIds ?? [],
    })
  } catch (error) {
    if (isSavedTabsDomainError(error)) {
      return null
    }
    throw error
  }
}

const toUrlRecordRaw = (entity: UrlRecord): UrlRecordRaw => {
  // favIconUrl が undefined のときは chrome.storage に `favIconUrl: undefined` を
  // 残さず省略する（既存の保存データ互換 + toStrictEqual テスト安定化）。
  const base: UrlRecordRaw = {
    id: entity.id,
    savedAt: entity.savedAt,
    title: entity.title,
    url: entity.url,
  }
  if (entity.favIconUrl !== undefined) {
    return { ...base, favIconUrl: entity.favIconUrl }
  }
  return base
}

const toSavedTabRaw = (entity: TabGroup): SavedTabRaw => {
  // parentCategoryId / savedAt が undefined のときも undefined プロパティを
  // 残さない。chrome.storage には undefined 値ではなく key 自体を省略する。
  // urlIds は空配列のときも key を省略（domain entity 化する時点で [] が入る
  // ため、書き出し時にまで残すと input データと差分が出てしまう）。
  const base: SavedTabRaw = {
    domain: entity.domain,
    id: entity.id,
  }
  if (entity.urlIds.length > 0) {
    base.urlIds = [...entity.urlIds]
  }
  if (entity.parentCategoryId !== undefined) {
    base.parentCategoryId = entity.parentCategoryId
  }
  if (entity.savedAt !== undefined) {
    base.savedAt = entity.savedAt
  }
  return base
}

const toParentCategoryRaw = (entity: ParentCategory): ParentCategoryRaw => ({
  domainNames: [...entity.domainNames],
  domains: [...entity.domains],
  id: entity.id,
  name: entity.name,
})

const toCustomProjectRaw = (entity: CustomProject): CustomProjectRaw => {
  const base: CustomProjectRaw = {
    categories: [...entity.categories],
    createdAt: entity.createdAt,
    id: entity.id,
    name: entity.name,
    updatedAt: entity.updatedAt,
  }
  if (entity.urlIds.length > 0) {
    base.urlIds = [...entity.urlIds]
  }
  return base
}

/**
 * `unknown` な生データをパースし、有効な `TabGroup` だけを返す。
 *
 * Zod parse 失敗 / entity 化失敗 / `null` / `undefined` の場合は `null` を返す。
 * repository 実装側で 1 件ずつ警告ログを出せるように、成功時のみ entity を返す。
 */
const parseTabGroup = (raw: unknown): TabGroup | null => {
  const parsed = SavedTabRawSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }
  return toTabGroupFromRaw(parsed.data)
}

const parseUrlRecord = (raw: unknown): UrlRecord | null => {
  const parsed = UrlRecordRawSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }
  return toUrlRecordFromRaw(parsed.data)
}

const parseParentCategory = (raw: unknown): ParentCategory | null => {
  const parsed = ParentCategoryRawSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }
  return toParentCategoryFromRaw(parsed.data)
}

const parseCustomProject = (raw: unknown): CustomProject | null => {
  const parsed = CustomProjectRawSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }
  return toCustomProjectFromRaw(parsed.data)
}

/**
 * `unknown` な配列データから、有効な entity だけを抽出する。
 *
 * 配列でない入力 / `null` / `undefined` は空配列として扱う。
 * 不正要素はスキップし、警告件数だけ呼び出し側に伝える。
 */
const parseTabGroups = (raw: unknown): TabGroup[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: TabGroup[] = []
  for (const item of raw) {
    const entity = parseTabGroup(item)
    if (entity) {
      result.push(entity)
    }
  }
  return result
}

const parseUrlRecords = (raw: unknown): UrlRecord[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: UrlRecord[] = []
  for (const item of raw) {
    const entity = parseUrlRecord(item)
    if (entity) {
      result.push(entity)
    }
  }
  return result
}

const parseParentCategories = (raw: unknown): ParentCategory[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: ParentCategory[] = []
  for (const item of raw) {
    const entity = parseParentCategory(item)
    if (entity) {
      result.push(entity)
    }
  }
  return result
}

const parseCustomProjects = (raw: unknown): CustomProject[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: CustomProject[] = []
  for (const item of raw) {
    const entity = parseCustomProject(item)
    if (entity) {
      result.push(entity)
    }
  }
  return result
}

/**
 * 不正な生データが何件スキップされたかを、配列パース結果と同時に返す。
 *
 * repository 実装が「N 件スキップした」をログに出したいケースで使う。
 */
interface ParseResult<T> {
  entities: T[]
  skippedCount: number
}

const collectParseSkipped = <T>(
  raw: unknown,
  parser: (item: unknown) => T | null,
): ParseResult<T> => {
  if (!Array.isArray(raw)) {
    return { entities: [], skippedCount: 0 }
  }
  const entities: T[] = []
  let skippedCount = 0
  for (const item of raw) {
    const entity = parser(item)
    if (entity) {
      entities.push(entity)
    } else {
      skippedCount += 1
    }
  }
  return { entities, skippedCount }
}

/**
 * `TabGroup` のエンティティ ID から storage 上の同値比較用 ID を取り出す。
 *
 * domain `TabGroupId` は branded string なので、`chrome.storage.local` のキーや
 * ログ出力で使える素の `string` に戻す。
 */
const tabGroupIdToString = (id: TabGroupId): string => id

const urlRecordIdToString = (id: UrlRecordId): string => id

const parentCategoryIdToString = (id: ParentCategoryId): string => id

const customProjectIdToString = (id: CustomProjectId): string => id

const domainNameToString = (name: DomainName): string => name

export const ChromeSavedTabsStorageMapper = {
  collectParseSkipped,
  customProjectIdToString,
  domainNameToString,
  parseCustomProject,
  parseCustomProjects,
  parseParentCategory,
  parseParentCategories,
  parseTabGroup,
  parseTabGroups,
  parseUrlRecord,
  parseUrlRecords,
  parentCategoryIdToString,
  tabGroupIdToString,
  toCustomProjectFromRaw,
  toCustomProjectRaw,
  toParentCategoryFromRaw,
  toParentCategoryRaw,
  toSavedTabRaw,
  toTabGroupFromRaw,
  toUrlRecordFromRaw,
  toUrlRecordRaw,
  urlRecordIdToString,
}

export type { ParseResult }

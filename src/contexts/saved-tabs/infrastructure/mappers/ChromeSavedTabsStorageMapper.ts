import { toStorageCustomProjectFromRaw } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import {
  createTabGroup,
  tabGroupDomainName,
} from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { normalizeDomainString } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import {
  CustomProjectRawSchema,
  ParentCategoryRawSchema,
  SavedTabRawSchema,
  UrlRecordRawSchema,
} from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/savedTabsStorageSchema'
import type {
  CustomProjectRaw,
  ParentCategoryRaw,
  SavedTabRaw,
  UrlRecordRaw,
} from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/savedTabsStorageSchema'

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
 * legacy category fields はこの mapper の内側だけで解釈し、domain には
 * Collection / CollectionCategory / Membership projection として渡す。
 */

const ORDER_GAP = 1024

const uniqueCategoryNames = (
  candidates: readonly (readonly string[] | undefined)[],
): readonly string[] => {
  const names: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    for (const name of candidate ?? []) {
      if (
        name === '__uncategorized' ||
        name === 'uncategorized' ||
        seen.has(name)
      ) {
        continue
      }
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

const createCollectionCategories = (input: {
  readonly collectionId: string
  readonly createdAt: number
  readonly keywords?: ReadonlyMap<string, readonly string[]>
  readonly names: readonly string[]
  readonly updatedAt: number
}) =>
  input.names.map((name, index) => ({
    collectionId: input.collectionId,
    createdAt: input.createdAt,
    id: `${input.collectionId}:category:${index}`,
    keywords: [...(input.keywords?.get(name) ?? [])],
    name,
    sortOrder: index * ORDER_GAP,
    updatedAt: input.updatedAt,
  }))

const categoryIdByName = (
  categories: readonly { readonly id: string; readonly name: string }[],
): ReadonlyMap<string, string> =>
  new Map(categories.map(({ id, name }) => [name, id]))

const categoryNameById = (
  categories: readonly { readonly id: string; readonly name: string }[],
): ReadonlyMap<string, string> =>
  new Map(categories.map(({ id, name }) => [id, name]))

const isSavedTabsDomainError = (
  error: unknown,
): error is SavedTabsDomainError => error instanceof SavedTabsDomainError

const toTabGroupFromRaw = (raw: SavedTabRaw): TabGroup | null => {
  try {
    const urlIds = raw.urlIds ?? []
    const timestamp = raw.savedAt ?? 0
    const keywordMap = new Map(
      raw.categoryKeywords?.map(({ categoryName, keywords }) => [
        categoryName,
        keywords,
      ]),
    )
    const declaredCategoryNames = uniqueCategoryNames([
      raw.subCategoryOrder,
      raw.subCategoryOrderWithUncategorized,
      raw.subCategories,
      raw.categoryKeywords?.map(({ categoryName }) => categoryName),
    ])
    const categoryNames =
      declaredCategoryNames.length > 0
        ? declaredCategoryNames
        : uniqueCategoryNames([
            raw.urlSubCategories
              ? Object.values(raw.urlSubCategories)
              : undefined,
          ])
    const collectionCategories = createCollectionCategories({
      collectionId: raw.id,
      createdAt: timestamp,
      keywords: keywordMap,
      names: categoryNames,
      updatedAt: timestamp,
    })
    const idsByName = categoryIdByName(collectionCategories)
    const domain = normalizeDomainString(raw.domain)
    return createTabGroup({
      collection: {
        createdAt: timestamp,
        definition: { domain, type: 'domain' },
        ...(raw.parentCategoryId !== undefined
          ? { groupId: raw.parentCategoryId }
          : {}),
        id: raw.id,
        name: domain,
        sortOrder: 0,
        updatedAt: timestamp,
      },
      collectionCategories,
      memberships: urlIds.map((urlId, index) => {
        const categoryName = raw.urlSubCategories?.[urlId]
        const categoryId =
          categoryName !== undefined ? idsByName.get(categoryName) : undefined
        return {
          addedAt: timestamp,
          ...(categoryId !== undefined ? { categoryId } : {}),
          collectionId: raw.id,
          sortOrder: index * ORDER_GAP,
          updatedAt: timestamp,
          urlId,
        }
      }),
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
      ...(raw.favIconUrl !== undefined ? { favIconUrl: raw.favIconUrl } : {}),
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
      collections: raw.domains.flatMap((id, index) => {
        const domain = raw.domainNames[index]
        return domain ? [{ domain: normalizeDomainString(domain), id }] : []
      }),
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
    // `categories` / `createdAt` / `updatedAt` は raw 段階では optional
    // （旧バージョン互換、issue #530 review P1）。entity 化段階で
    // default を入れて domain 不変条件を満たす。
    const createdAt = raw.createdAt ?? 0
    const updatedAt = raw.updatedAt ?? createdAt
    const categoryNames = uniqueCategoryNames([
      raw.categoryOrder,
      raw.categories,
      raw.urlMetadata
        ? Object.values(raw.urlMetadata).flatMap(({ category }) =>
            category ? [category] : [],
          )
        : undefined,
    ])
    const collectionCategories = createCollectionCategories({
      collectionId: raw.id,
      createdAt,
      names: categoryNames,
      updatedAt,
    })
    const idsByName = categoryIdByName(collectionCategories)
    return createCustomProject({
      collection: {
        createdAt,
        definition: {
          projectKeywords: raw.projectKeywords ?? {
            domainKeywords: [],
            titleKeywords: [],
            urlKeywords: [],
          },
          type: 'custom',
        },
        id: raw.id,
        name: raw.name,
        sortOrder: 0,
        updatedAt,
      },
      collectionCategories,
      memberships: (raw.urlIds ?? []).map((urlId, index) => {
        const metadata = raw.urlMetadata?.[urlId]
        const categoryId =
          metadata?.category !== undefined
            ? idsByName.get(metadata.category)
            : undefined
        return {
          addedAt: createdAt,
          ...(categoryId !== undefined ? { categoryId } : {}),
          collectionId: raw.id,
          ...(metadata?.notes !== undefined ? { notes: metadata.notes } : {}),
          sortOrder: index * ORDER_GAP,
          updatedAt,
          urlId,
        }
      }),
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

const copySavedTabRichFields = (
  base: SavedTabRaw,
  entity: TabGroup,
  original?: SavedTabRaw,
): void => {
  const preservedUrlIds = new Set<string>(
    entity.memberships.map(({ urlId }) => urlId),
  )
  if (original?.urls) {
    const filteredUrls = original.urls.filter((item) =>
      item.id === undefined ? true : preservedUrlIds.has(item.id),
    )
    if (filteredUrls.length > 0) {
      base.urls = filteredUrls
    }
  }
  const namesById = categoryNameById(entity.collectionCategories)
  const urlSubCategories = Object.fromEntries(
    entity.memberships.flatMap(({ categoryId, urlId }) => {
      const categoryName = categoryId ? namesById.get(categoryId) : undefined
      return categoryName ? [[urlId, categoryName]] : []
    }),
  )
  if (Object.keys(urlSubCategories).length > 0) {
    const filteredSubCategories: Record<string, string> = {}
    for (const [urlId, subCategory] of Object.entries(urlSubCategories)) {
      if (preservedUrlIds.has(urlId)) {
        filteredSubCategories[urlId] = subCategory
      }
    }
    if (Object.keys(filteredSubCategories).length > 0) {
      base.urlSubCategories = filteredSubCategories
    }
  }
  const orderedCategories = entity.collectionCategories.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  const categoryNames = orderedCategories.map(({ name }) => name)
  if (categoryNames.length > 0) {
    base.subCategories = categoryNames
    base.subCategoryOrder = categoryNames
    const originalOrder = original?.subCategoryOrderWithUncategorized
    const hasUncategorized = originalOrder?.some(
      (name) => name === '__uncategorized' || name === 'uncategorized',
    )
    base.subCategoryOrderWithUncategorized = hasUncategorized
      ? (originalOrder ?? []).flatMap((name) =>
          name === '__uncategorized' ||
          name === 'uncategorized' ||
          categoryNames.includes(name)
            ? [name]
            : [],
        )
      : categoryNames
    base.categoryKeywords = orderedCategories.map(({ keywords, name }) => ({
      categoryName: name,
      keywords: [...keywords],
    }))
  }
}

const toSavedTabRaw = (
  entity: TabGroup,
  original?: SavedTabRaw,
): SavedTabRaw => {
  // parentCategoryId / savedAt が undefined のときも undefined プロパティを
  // 残さない。chrome.storage には undefined 値ではなく key 自体を省略する。
  // urlIds は空配列のときも key を省略（domain entity 化する時点で [] が入る
  // ため、書き出し時にまで残すと input データと差分が出てしまう）。
  //
  // `domain` フィールド: domain entity 化時に hostname 形式へ正規化されるが、
  // 既存ユーザーの chrome.storage には schemeful 形式
  // （例: `https://example.com`）で書き込まれているケースがある。
  // その状態で use-case 経由で save すると正規化後の `example.com` が
  // 書き戻され、続いて `getTabDomain()`（`src/lib/storage/migration.ts`）が
  // 生成する schemeful 形式の `https://example.com` と一致しなくなって
  // 重複グループが発生する（issue #501 review P1 指摘）。
  // 既存 raw があればそちらの schemeful 形式を保持し、新規エンティティの
  // 場合のみ entity 側の正規化済み domain を使う。
  const base: SavedTabRaw = {
    domain: original?.domain ?? tabGroupDomainName(entity),
    id: entity.id,
  }
  if (entity.memberships.length > 0) {
    base.urlIds = entity.memberships.map(({ urlId }) => urlId)
  }
  if (entity.collection.groupId !== undefined) {
    base.parentCategoryId = entity.collection.groupId
  }
  if (entity.savedAt !== undefined && entity.savedAt !== 0) {
    base.savedAt = entity.savedAt
  }
  // normalized category / membership を authoritative とし、legacy `urls` のみ
  // original から補完する。
  // URL 単位の補助データは membership に揃えて孤立参照を除く。
  copySavedTabRichFields(base, entity, original)
  return base
}

const toParentCategoryRaw = (
  entity: ParentCategory,
  original?: ParentCategoryRaw,
): ParentCategoryRaw => {
  // `domainNames` フィールド: domain entity 化時に hostname 形式へ
  // 正規化されるが、既存 chrome.storage には schemeful 形式
  // （例: `https://example.com`）で書き込まれているケースがある
  // （`assignDomainToCategory` が `tabGroup.domain`（schemeful）を
  // そのまま `category.domainNames` に追加するため）。書き戻し時に
  // original 側の schemeful 形式を持ち越さないと、既存 parent
  // category と新規割当の `domainNames` 比較でミスマッチが起きる
  // （issue #501 review P1 と同根の問題）。
  //
  // 一方、entity 側の `collections` は use-case
  // （AddDomainTo / RemoveDomainFromParentCategory）が更新した結果
  // を反映している。`original.domainNames` をそのままコピーすると
  // 追加・削除が無視されてしまうため、entity の順序と内容を採用
  // しつつ、original に schemeful 形式で残っている既存エントリは
  // hostname 比較で引き継ぐ。
  const originalByHostname = new Map<string, string>()
  if (original) {
    for (const name of original.domainNames) {
      originalByHostname.set(normalizeDomainString(name), name)
    }
  }
  const domainNames = entity.collections.map(
    ({ domain }) => originalByHostname.get(domain) ?? domain,
  )
  const base: ParentCategoryRaw = {
    domainNames,
    domains: entity.collections.map(({ id }) => id),
    id: entity.id,
    name: entity.name,
  }
  return base
}

const toCustomProjectRaw = (
  entity: CustomProject,
  original?: CustomProjectRaw,
): CustomProjectRaw => {
  const orderedCategories = entity.collectionCategories.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  const namesById = categoryNameById(orderedCategories)
  const categoryNames = orderedCategories.map(({ name }) => name)
  const base: CustomProjectRaw = {
    categories: categoryNames,
    categoryOrder: categoryNames,
    createdAt: entity.createdAt,
    id: entity.id,
    name: entity.name,
    updatedAt: entity.updatedAt,
  }
  if (entity.memberships.length > 0) {
    base.urlIds = entity.memberships.map(({ urlId }) => urlId)
  }
  base.projectKeywords = {
    domainKeywords: [
      ...entity.collection.definition.projectKeywords.domainKeywords,
    ],
    titleKeywords: [
      ...entity.collection.definition.projectKeywords.titleKeywords,
    ],
    urlKeywords: [...entity.collection.definition.projectKeywords.urlKeywords],
  }
  // legacy nested URL payload は original からだけ補完する。
  // URL 単位の category / notes は membership を authoritative projection
  // として raw metadata に戻し、削除済み metadata を復活させない。
  const urlMetadata = Object.fromEntries(
    entity.memberships.flatMap(({ categoryId, notes, urlId }) => {
      const category = categoryId ? namesById.get(categoryId) : undefined
      return category || notes
        ? [
            [
              urlId,
              {
                ...(category ? { category } : {}),
                ...(notes ? { notes } : {}),
              },
            ],
          ]
        : []
    }),
  )
  if (Object.keys(urlMetadata).length > 0) {
    base.urlMetadata = urlMetadata
  }
  // urls 配列は legacy 形式（URL 文字列を保持）。ID 同期は不能なので、
  // membership が空ではない限り original.urls をそのまま保持する。
  // membership が空になった場合は対象 project の URL がすべて削除された
  // と解釈し、urls 配列も省略する。
  if (original?.urls && entity.memberships.length > 0) {
    base.urls = original.urls.map((entry) => ({ ...entry }))
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
type ParseResult<T> = {
  entities: T[]
  skippedCount: number
}

function collectParseSkipped<T>(
  raw: unknown,
  parser: (item: unknown) => T | null,
): ParseResult<T> {
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
  toStorageCustomProject: toStorageCustomProjectFromRaw,
  toTabGroupFromRaw,
  toUrlRecordFromRaw,
  toUrlRecordRaw,
  urlRecordIdToString,
}

export type { ParseResult }

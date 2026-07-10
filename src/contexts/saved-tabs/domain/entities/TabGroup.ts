import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { ensureStringArray } from '@/contexts/saved-tabs/domain/services/ensureStringArray'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createSavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import type { SavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * ドメイン単位で URL レコードをまとめるタブグループのドメインエンティティ。
 *
 * `chrome.storage.local` 上の `savedTabs[]` と 1:1 対応する不変モデル。
 * 実 URL は `urlIds`（`UrlRecordId` の配列）として参照し、URL 本体は
 * `urlRecords[]` に集約する設計（issue #454 / #456）。
 *
 * 既存データ互換のため `parentCategoryId` は省略可能。`savedAt` も省略可能で、
 * 「いつ作られたか」が判明していないグループは未設定のまま扱う。
 *
 * @example
 * ```ts
 * const group = createTabGroup({
 *   id: 'group-1',
 *   domain: 'example.com',
 *   urlIds: ['url-1', 'url-2'],
 * })
 * tabGroupUrlCount(group) // 2
 * ```
 */
export type TabGroup = {
  readonly id: TabGroupId
  readonly domain: DomainName
  readonly urlIds: readonly UrlRecordId[]
  readonly urlSubCategories?: Readonly<Record<string, string>>
  readonly subCategories?: readonly string[]
  readonly categoryKeywords?: readonly {
    readonly categoryName: string
    readonly keywords: readonly string[]
  }[]
  readonly subCategoryOrder?: readonly string[]
  readonly subCategoryOrderWithUncategorized?: readonly string[]
  readonly parentCategoryId?: ParentCategoryId
  readonly savedAt?: SavedAt
}

type CreateTabGroupInput = {
  id: string
  domain: string
  urlIds: readonly string[]
  urlSubCategories?: Readonly<Record<string, string>>
  subCategories?: readonly string[]
  categoryKeywords?: readonly {
    readonly categoryName: string
    readonly keywords: readonly string[]
  }[]
  subCategoryOrder?: readonly string[]
  subCategoryOrderWithUncategorized?: readonly string[]
  parentCategoryId?: string
  savedAt?: number
}

/**
 * `TabGroup` を生成する。
 *
 * `urlIds` 内に空文字列や重複があった場合は `SavedTabsDomainError` を投げる。
 * `parentCategoryId` と `savedAt` は省略可能だが、与えられた場合は
 * 各値オブジェクトのバリデーションを必ず通る。
 */
export const createTabGroup = (input: CreateTabGroupInput): TabGroup => {
  const rawUrlIds: readonly string[] = ensureStringArray(
    input.urlIds,
    'TabGroup の urlIds は配列で指定してください',
    'INVALID_TAB_GROUP',
  )
  const seen = new Set<string>()
  const urlIds: UrlRecordId[] = []
  for (const rawId of rawUrlIds) {
    const urlId = createUrlRecordId(rawId)
    if (seen.has(urlId)) {
      throw new SavedTabsDomainError(
        'TabGroup の urlIds に重複があります',
        'INVALID_TAB_GROUP',
      )
    }
    seen.add(urlId)
    urlIds.push(urlId)
  }
  return {
    id: createTabGroupId(input.id),
    domain: createDomainName(input.domain),
    urlIds,
    ...(input.urlSubCategories
      ? { urlSubCategories: { ...input.urlSubCategories } }
      : {}),
    ...(input.subCategories ? { subCategories: [...input.subCategories] } : {}),
    ...(input.categoryKeywords
      ? {
          categoryKeywords: input.categoryKeywords.map((entry) => ({
            categoryName: entry.categoryName,
            keywords: [...entry.keywords],
          })),
        }
      : {}),
    ...(input.subCategoryOrder
      ? { subCategoryOrder: [...input.subCategoryOrder] }
      : {}),
    ...(input.subCategoryOrderWithUncategorized
      ? {
          subCategoryOrderWithUncategorized: [
            ...input.subCategoryOrderWithUncategorized,
          ],
        }
      : {}),
    parentCategoryId:
      input.parentCategoryId === undefined
        ? undefined
        : createParentCategoryId(input.parentCategoryId),
    savedAt:
      input.savedAt === undefined ? undefined : createSavedAt(input.savedAt),
  }
}

/**
 * 2 つの `TabGroup` を ID で同一視するかを判定する。
 */
export const isSameTabGroup = (a: TabGroup, b: TabGroup): boolean =>
  a.id === b.id

/**
 * `TabGroup` が保持する URL レコード数を返す。
 *
 * 既存の `countTabGroupUrls` / `getDisplayUrlCount` ヘルパーの domain 等価物。
 */
export const tabGroupUrlCount = (group: TabGroup): number => group.urlIds.length

/**
 * 指定の `UrlRecordId` を含むかを判定する。
 */
export const tabGroupContainsUrlRecord = (
  group: TabGroup,
  urlRecordId: UrlRecordId,
): boolean => group.urlIds.includes(urlRecordId)

import type { CollectionProjectionDto } from '@/contexts/saved-tabs/domain/dto/CollectionProjectionDto'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionMembership,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createSavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import type { SavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * ドメイン単位で URL レコードをまとめるタブグループのドメインエンティティ。
 *
 * 永続化形式とは独立した不変モデル。URL 本体は `UrlRecord` 集約が保持し、
 * この集約は `memberships` を通して URL とカテゴリの所属関係を表現する。
 *
 * 既存データ互換のため `parentCategoryId` は省略可能。`savedAt` も省略可能で、
 * 「いつ作られたか」が判明していないグループは未設定のまま扱う。
 *
 * @example
 * ```ts
 * const group = createTabGroup({
 *   id: 'group-1',
 *   domain: 'example.com',
 *   memberships: [{ urlId: 'url-1' }, { urlId: 'url-2' }],
 * })
 * tabGroupUrlCount(group) // 2
 * ```
 */
export type TabGroup = Omit<
  CollectionProjectionDto,
  'collection' | 'memberships'
> & {
  readonly collection: PersistenceV2Collection & {
    readonly definition: Extract<
      PersistenceV2Collection['definition'],
      { readonly type: 'domain' }
    >
  }
  readonly id: TabGroupId
  readonly memberships: readonly TabGroupMembership[]
  readonly savedAt?: SavedAt
}

export type TabGroupMembership = Omit<
  PersistenceV2CollectionMembership,
  'collectionId' | 'urlId'
> & {
  readonly collectionId: TabGroupId
  readonly urlId: UrlRecordId
}

type CreateTabGroupInput = {
  readonly collection: TabGroup['collection']
  readonly collectionCategories: readonly PersistenceV2CollectionCategory[]
  readonly memberships: readonly PersistenceV2CollectionMembership[]
}

/**
 * `TabGroup` を生成する。
 *
 * membership の URL ID に空文字列や重複があった場合は
 * `SavedTabsDomainError` を投げる。
 * `parentCategoryId` と `savedAt` は省略可能だが、与えられた場合は
 * 各値オブジェクトのバリデーションを必ず通る。
 */
export const createTabGroup = (input: CreateTabGroupInput): TabGroup => {
  if (!Array.isArray(input.memberships)) {
    throw new SavedTabsDomainError(
      'TabGroup の memberships は配列で指定してください',
      'INVALID_TAB_GROUP',
    )
  }
  const id = createTabGroupId(input.collection.id)
  const domain = createDomainName(input.collection.definition.domain)
  const createdAt = createSavedAt(input.collection.createdAt)
  const updatedAt = createSavedAt(input.collection.updatedAt)
  const groupId = input.collection.groupId
    ? createParentCategoryId(input.collection.groupId)
    : undefined
  const seen = new Set<string>()
  const inputMemberships: readonly PersistenceV2CollectionMembership[] =
    input.memberships
  const memberships: TabGroupMembership[] = inputMemberships.map(
    (membership) => {
      if (membership.collectionId !== id) {
        throw new SavedTabsDomainError(
          'TabGroup の membership が別の collection を参照しています',
          'INVALID_TAB_GROUP',
        )
      }
      const urlId = createUrlRecordId(membership.urlId)
      if (seen.has(urlId)) {
        throw new SavedTabsDomainError(
          'TabGroup の memberships に重複した URL ID があります',
          'INVALID_TAB_GROUP',
        )
      }
      seen.add(urlId)
      return { ...membership, collectionId: id, urlId }
    },
  )
  return {
    collection: {
      ...input.collection,
      createdAt,
      definition: { domain, type: 'domain' },
      ...(groupId ? { groupId } : { groupId: undefined }),
      id,
      name: createCategoryName(input.collection.name),
      updatedAt,
    },
    collectionCategories: input.collectionCategories.map((category) => ({
      ...category,
      collectionId: id,
      keywords: [...category.keywords],
      name: createCategoryName(category.name),
    })),
    id,
    memberships,
    savedAt: createdAt,
  }
}

/**
 * 2 つの `TabGroup` を ID で同一視するかを判定する。
 */
export const isSameTabGroup = (a: TabGroup, b: TabGroup): boolean =>
  a.collection.id === b.collection.id

export const tabGroupDomainName = (group: TabGroup): string =>
  group.collection.definition.domain

export const tabGroupCollectionGroupId = (
  group: TabGroup,
): string | undefined => group.collection.groupId

export const assignTabGroupToCollectionGroup = (
  group: TabGroup,
  groupId: string | undefined,
): TabGroup => ({
  ...group,
  collection: {
    ...group.collection,
    ...(groupId === undefined ? { groupId: undefined } : { groupId }),
  },
})

/**
 * `TabGroup` が保持する URL レコード数を返す。
 *
 * 既存の `countTabGroupUrls` / `getDisplayUrlCount` ヘルパーの domain 等価物。
 */
export const tabGroupUrlCount = (group: TabGroup): number =>
  group.memberships.length

/**
 * 指定の `UrlRecordId` を含むかを判定する。
 */
export const tabGroupContainsUrlRecord = (
  group: TabGroup,
  urlRecordId: UrlRecordId,
): boolean => group.memberships.some(({ urlId }) => urlId === urlRecordId)

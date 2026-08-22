import type { CollectionProjectionDto } from '@/contexts/saved-tabs/domain/dto/CollectionProjectionDto'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionMembership,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import type { CategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createSavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import type { SavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * カスタムプロジェクト（PJ 単位）を表すドメインエンティティ。
 *
 * `TabGroup` がドメイン軸の集約であるのに対し、`CustomProject` は
 * 任意のユーザー作業単位（例: 「Q4 リサーチ」「副業案件 A」）で
 * URL を束ねる集約。URL 本体は `UrlRecord` 集約が保持し、この集約は
 * `memberships` を通して URL とカテゴリ・メモの所属関係を表現する。
 *
 * @example
 * ```ts
 * const project = createCustomProject({
 *   id: 'project-1',
 *   name: 'Q4 Research',
 *   memberships: [{ urlId: 'url-1' }],
 *   categories: ['research'],
 *   createdAt: 1700000000000,
 *   updatedAt: 1700000000000,
 * })
 * ```
 */
export type CustomProject = Omit<
  CollectionProjectionDto,
  'collection' | 'memberships'
> & {
  readonly collection: PersistenceV2Collection & {
    readonly definition: Extract<
      PersistenceV2Collection['definition'],
      { readonly type: 'custom' }
    >
  }
  readonly createdAt: SavedAt
  readonly id: CustomProjectId
  readonly memberships: readonly CustomProjectMembership[]
  readonly name: CategoryName
  readonly updatedAt: SavedAt
}

export type CustomProjectMembership = Omit<
  PersistenceV2CollectionMembership,
  'collectionId' | 'urlId'
> & {
  readonly collectionId: CustomProjectId
  readonly urlId: UrlRecordId
}

type CreateCustomProjectInput = {
  readonly collection: CustomProject['collection']
  readonly collectionCategories: readonly PersistenceV2CollectionCategory[]
  readonly memberships: readonly PersistenceV2CollectionMembership[]
}

/**
 * `CustomProject` を生成する。
 *
 * membership の URL ID の重複は domain 不変条件違反として扱う（同じ URL を
 * 同じ project 内で二重登録しない）。`categories` は空配列を許容するが、
 * カテゴリ名の重複は許容しない。
 */
export const createCustomProject = (
  input: CreateCustomProjectInput,
): CustomProject => {
  if (!Array.isArray(input.memberships)) {
    throw new SavedTabsDomainError(
      'CustomProject の memberships は配列で指定してください',
      'INVALID_CUSTOM_PROJECT',
    )
  }
  const id = createCustomProjectId(input.collection.id)
  const name = createCategoryName(input.collection.name)
  const createdAt = createSavedAt(input.collection.createdAt)
  const updatedAt = createSavedAt(input.collection.updatedAt)
  const { groupId, ...inputCollection } = input.collection
  const seenUrlIds = new Set<string>()
  const memberships: CustomProjectMembership[] = []
  const inputMemberships: readonly PersistenceV2CollectionMembership[] =
    input.memberships
  for (const membership of inputMemberships) {
    if (membership.collectionId !== id) {
      throw new SavedTabsDomainError(
        'CustomProject の membership が別の collection を参照しています',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    const urlId = createUrlRecordId(membership.urlId)
    if (seenUrlIds.has(urlId)) {
      throw new SavedTabsDomainError(
        'CustomProject の memberships に重複した URL ID があります',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    seenUrlIds.add(urlId)
    const { addedAtProvenance, categoryId, notes, ...requiredMembership } =
      membership
    memberships.push({
      ...requiredMembership,
      ...(addedAtProvenance === undefined ? {} : { addedAtProvenance }),
      ...(categoryId === undefined ? {} : { categoryId }),
      collectionId: id,
      ...(notes === undefined ? {} : { notes }),
      urlId,
    })
  }
  const seenCategoryIds = new Set<string>()
  const collectionCategories = input.collectionCategories.map((category) => {
    if (category.collectionId !== id) {
      throw new SavedTabsDomainError(
        'CustomProject の category が別の collection を参照しています',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    if (seenCategoryIds.has(category.id)) {
      throw new SavedTabsDomainError(
        'CustomProject の categories に重複があります',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    seenCategoryIds.add(category.id)
    return {
      ...category,
      collectionId: id,
      keywords: [...category.keywords],
      name: createCategoryName(category.name),
    }
  })
  return {
    collection: {
      ...inputCollection,
      createdAt,
      definition: {
        ...input.collection.definition,
        projectKeywords: {
          domainKeywords: [
            ...input.collection.definition.projectKeywords.domainKeywords,
          ],
          titleKeywords: [
            ...input.collection.definition.projectKeywords.titleKeywords,
          ],
          urlKeywords: [
            ...input.collection.definition.projectKeywords.urlKeywords,
          ],
        },
      },
      ...(groupId === undefined ? {} : { groupId }),
      id,
      name,
      updatedAt,
    },
    collectionCategories,
    createdAt,
    id,
    memberships,
    name,
    updatedAt,
  }
}

/**
 * 2 つの `CustomProject` を ID で同一視するかを判定する。
 */
export const isSameCustomProject = (
  a: CustomProject,
  b: CustomProject,
): boolean => a.collection.id === b.collection.id

export const customProjectCategoryNames = (
  project: CustomProject,
): readonly string[] =>
  project.collectionCategories
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map(({ name }) => name)

/**
 * 指定の `UrlRecordId` がこのプロジェクトに登録されているかを判定する。
 */
export const customProjectContainsUrlRecord = (
  project: CustomProject,
  urlRecordId: UrlRecordId,
): boolean => project.memberships.some(({ urlId }) => urlId === urlRecordId)

/**
 * プロジェクトが参照する URL レコード数を返す。
 */
export const customProjectUrlCount = (project: CustomProject): number =>
  project.memberships.length

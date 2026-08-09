import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import type { CategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { tryCreateDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * 親カテゴリを表すドメインエンティティ。
 *
 * 1 つのカテゴリは、紐づく collection の ID と domain を同じ参照に
 * まとめて保持する。parallel array を持たないため、relation の片側だけが
 * 更新される状態を表現できない。
 *
 * カテゴリ自動判定（URL のドメインと collection domain の一致など）は
 * `CategoryAssignmentPolicy` / `TabGroupCategorizationService` に置く。
 *
 * @example
 * ```ts
 * const category = createParentCategory({
 *   id: 'docs',
 *   name: 'Docs',
 *   collections: [{ id: 'group-1', domain: 'example.com' }],
 * })
 * ```
 */
export type ParentCategoryCollection = {
  readonly domain: DomainName
  readonly id: TabGroupId
}

export type ParentCategory = {
  readonly collections: readonly ParentCategoryCollection[]
  readonly id: ParentCategoryId
  readonly name: CategoryName
}

type CreateParentCategoryInput = {
  collections: readonly {
    readonly domain: string
    readonly id: string
  }[]
  id: string
  name: string
}

const assertCollections = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new SavedTabsDomainError(
      'ParentCategory の collections は配列で指定してください',
      'INVALID_PARENT_CATEGORY',
    )
  }
}

/**
 * `ParentCategory` を生成する。
 *
 * 同じ collection ID の重複は relation の一意性違反として拒否する。
 * 永続化境界から不正な domain が渡された場合は relation 全体を除外し、
 * 1 件の互換データ不備でカテゴリ全体を読み込めなくしない。
 */
export const createParentCategory = (
  input: CreateParentCategoryInput,
): ParentCategory => {
  assertCollections(input.collections)
  const seen = new Set<string>()
  const collections: ParentCategoryCollection[] = []
  for (const collection of input.collections) {
    const domain = tryCreateDomainName(collection.domain)
    if (!domain) {
      continue
    }
    const id = createTabGroupId(collection.id)
    if (seen.has(id)) {
      throw new SavedTabsDomainError(
        'ParentCategory の collections に重複があります',
        'INVALID_PARENT_CATEGORY',
      )
    }
    seen.add(id)
    collections.push({ domain, id })
  }
  return {
    collections,
    id: createParentCategoryId(input.id),
    name: createCategoryName(input.name),
  }
}

/**
 * 2 つの `ParentCategory` を ID で同一視するかを判定する。
 */
export const isSameParentCategory = (
  a: ParentCategory,
  b: ParentCategory,
): boolean => a.id === b.id

/**
 * 指定の `TabGroupId` がこのカテゴリに登録されているかを判定する。
 */
export const parentCategoryContainsTabGroup = (
  category: ParentCategory,
  tabGroupId: TabGroupId,
): boolean => category.collections.some(({ id }) => id === tabGroupId)

/**
 * 指定の `DomainName` がこのカテゴリに登録されているかを判定する。
 */
export const parentCategoryContainsDomainName = (
  category: ParentCategory,
  domainName: DomainName,
): boolean => category.collections.some(({ domain }) => domain === domainName)

/**
 * ID で `ParentCategory` を検索する。見つからない場合は `undefined`。
 *
 * use-case 側 (RenameParentCategoryUseCase /
 * AddDomainToParentCategoryUseCase / RemoveDomainFromParentCategoryUseCase)
 * の共通ヘルパー。`equalsParentCategoryId` と同じく
 * branded `ParentCategoryId` をキー比較する。
 *
 * @example
 * ```ts
 * const category = parentCategoryById(allCategories, targetId)
 * if (!category) {
 *   throw new SavedTabsDomainError(...)
 * }
 * ```
 */
export const parentCategoryById = (
  categories: readonly ParentCategory[],
  categoryId: ParentCategoryId,
): ParentCategory | undefined =>
  categories.find((category) => category.id === categoryId)

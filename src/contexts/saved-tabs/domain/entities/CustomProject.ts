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
 * URL を束ねる集約。実 URL は `urlIds` で `UrlRecord` を参照する。
 *
 * @example
 * ```ts
 * const project = createCustomProject({
 *   id: 'project-1',
 *   name: 'Q4 Research',
 *   urlIds: ['url-1'],
 *   categories: ['research'],
 *   createdAt: 1700000000000,
 *   updatedAt: 1700000000000,
 * })
 * ```
 */
export interface CustomProject {
  readonly id: CustomProjectId
  readonly name: CategoryName
  readonly urlIds: readonly UrlRecordId[]
  readonly categories: readonly CategoryName[]
  readonly createdAt: SavedAt
  readonly updatedAt: SavedAt
}

interface CreateCustomProjectInput {
  id: string
  name: string
  urlIds: readonly string[]
  categories: readonly string[]
  createdAt: number
  updatedAt: number
}

/**
 * `CustomProject` を生成する。
 *
 * `urlIds` 内の重複は domain 不変条件違反として扱う（同じ URL を
 * 同じ project 内で二重登録しない）。`categories` は空配列を許容するが、
 * カテゴリ名の重複は許容しない。
 */
export const createCustomProject = (
  input: CreateCustomProjectInput,
): CustomProject => {
  const rawUrlIds: readonly string[] = ensureStringArray(
    input.urlIds,
    'CustomProject の urlIds は配列で指定してください',
  )
  const rawCategories: readonly string[] = ensureStringArray(
    input.categories,
    'CustomProject の categories は配列で指定してください',
  )
  const seenUrlIds = new Set<string>()
  const urlIds: UrlRecordId[] = []
  for (const rawId of rawUrlIds) {
    const urlId = createUrlRecordId(rawId)
    if (seenUrlIds.has(urlId)) {
      throw new SavedTabsDomainError(
        'CustomProject の urlIds に重複があります',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    seenUrlIds.add(urlId)
    urlIds.push(urlId)
  }
  const seenCategoryNames = new Set<string>()
  const categories: CategoryName[] = []
  for (const rawName of rawCategories) {
    const categoryName = createCategoryName(rawName)
    if (seenCategoryNames.has(categoryName)) {
      throw new SavedTabsDomainError(
        'CustomProject の categories に重複があります',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    seenCategoryNames.add(categoryName)
    categories.push(categoryName)
  }
  return {
    id: createCustomProjectId(input.id),
    name: createCategoryName(input.name),
    urlIds,
    categories,
    createdAt: createSavedAt(input.createdAt),
    updatedAt: createSavedAt(input.updatedAt),
  }
}

const ensureStringArray = (
  value: readonly string[],
  message: string,
): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new SavedTabsDomainError(message, 'INVALID_CUSTOM_PROJECT')
  }
  // OK: input 型は readonly string[] であり、Array.isArray の narrowing で
  // any[] へ広がるのを元の型へ戻すだけのキャストにする。
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return value as readonly string[]
}

/**
 * 2 つの `CustomProject` を ID で同一視するかを判定する。
 */
export const isSameCustomProject = (
  a: CustomProject,
  b: CustomProject,
): boolean => a.id === b.id

/**
 * 指定の `UrlRecordId` がこのプロジェクトに登録されているかを判定する。
 */
export const customProjectContainsUrlRecord = (
  project: CustomProject,
  urlRecordId: UrlRecordId,
): boolean => project.urlIds.includes(urlRecordId)

/**
 * プロジェクトが参照する URL レコード数を返す。
 */
export const customProjectUrlCount = (project: CustomProject): number =>
  project.urlIds.length

import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'

declare const parentCategoryIdBrand: unique symbol

/**
 * `ParentCategory` の識別子を表す不変値オブジェクト。
 *
 * `chrome.storage.local` 上の `parentCategories[].id` と一致させる前提で、
 * domain 層は形式の妥当性（非空）のみを検証する。
 *
 * @example
 * ```ts
 * const id = createParentCategoryId('docs')
 * parentCategoryIdToString(id) // 'docs'
 * ```
 */
export type ParentCategoryId = string & {
  readonly [parentCategoryIdBrand]: 'ParentCategoryId'
}

/**
 * `ParentCategoryId` 値オブジェクトを生成する。
 */
export const createParentCategoryId = (value: string): ParentCategoryId => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SavedTabsDomainError(
      'ParentCategory ID は空文字列にできません',
      'INVALID_ID',
    )
  }
  // OK: createParentCategoryId は検証通過後のブランド型タグ付けに限定
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return value as ParentCategoryId
}

/**
 * `ParentCategoryId` を生文字列へ戻す。
 */
export const parentCategoryIdToString = (id: ParentCategoryId): string => id

/**
 * 2 つの `ParentCategoryId` を比較する。
 */
export const equalsParentCategoryId = (
  a: ParentCategoryId,
  b: ParentCategoryId,
): boolean => a === b

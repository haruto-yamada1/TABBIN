import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

declare const categoryNameBrand: unique symbol

/**
 * カテゴリ名を表す不変値オブジェクト。
 *
 * 親カテゴリ・子カテゴリのどちらでも使う。
 * 空文字列や空白のみは不正値とし、前後の空白は除去して保持する。
 * 比較は完全一致（大文字小文字を区別）で行う。
 *
 * @example
 * ```ts
 * const name = createCategoryName('  Docs  ')
 * categoryNameToString(name) // 'Docs'
 * ```
 */
export type CategoryName = string & {
  readonly [categoryNameBrand]: 'CategoryName'
}

const MAX_CATEGORY_NAME_LENGTH = 200

/**
 * `CategoryName` 値オブジェクトを生成する。
 *
 * 入力に対して trim だけ行い、200 文字を超える長さは不正値とする。
 * 保存済みデータと衝突しないよう、絵文字や非 ASCII 文字は許容する。
 */
export const createCategoryName = (value: string): CategoryName => {
  if (typeof value !== 'string') {
    throw new SavedTabsDomainError(
      'カテゴリ名は文字列で指定してください',
      'INVALID_CATEGORY_NAME',
    )
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new SavedTabsDomainError(
      'カテゴリ名は空文字列にできません',
      'INVALID_CATEGORY_NAME',
    )
  }
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new SavedTabsDomainError(
      `カテゴリ名は ${MAX_CATEGORY_NAME_LENGTH} 文字以内で指定してください`,
      'INVALID_CATEGORY_NAME',
    )
  }
  // OK: createCategoryName は正規化後のブランド型タグ付けに限定
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- branded primitive constructor boundary after runtime validation
  return trimmed as CategoryName
}

/**
 * `CategoryName` を生文字列へ戻す。
 */
export const categoryNameToString = (name: CategoryName): string => name

/**
 * 2 つの `CategoryName` を完全一致で比較する。
 */
export const equalsCategoryName = (a: CategoryName, b: CategoryName): boolean =>
  a === b

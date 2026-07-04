import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

declare const customProjectIdBrand: unique symbol

/**
 * `CustomProject` の識別子を表す不変値オブジェクト。
 *
 * `chrome.storage.local` 上の `customProjects[].id` と一致させる前提で、
 * domain 層は形式の妥当性（非空）のみを検証する。
 *
 * @example
 * ```ts
 * const id = createCustomProjectId('project-1')
 * customProjectIdToString(id) // 'project-1'
 * ```
 */
export type CustomProjectId = string & {
  readonly [customProjectIdBrand]: 'CustomProjectId'
}

/**
 * `CustomProjectId` 値オブジェクトを生成する。
 */
export const createCustomProjectId = (value: string): CustomProjectId => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SavedTabsDomainError(
      'CustomProject ID は空文字列にできません',
      'INVALID_ID',
    )
  }
  // OK: createCustomProjectId は検証通過後のブランド型タグ付けに限定
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- branded primitive constructor boundary after runtime validation
  return value as CustomProjectId
}

/**
 * `CustomProjectId` を生文字列へ戻す。
 */
export const customProjectIdToString = (id: CustomProjectId): string => id

/**
 * 2 つの `CustomProjectId` を比較する。
 */
export const equalsCustomProjectId = (
  a: CustomProjectId,
  b: CustomProjectId,
): boolean => a === b

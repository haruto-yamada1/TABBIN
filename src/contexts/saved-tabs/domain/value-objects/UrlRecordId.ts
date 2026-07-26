import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

declare const urlRecordIdBrand: unique symbol

/**
 * `UrlRecord` の識別子を表す不変値オブジェクト。
 *
 * 採番アルゴリズムは infrastructure 側に任せ、domain 層では
 * 「非空の文字列であること」のみ保証する。
 *
 * @example
 * ```ts
 * const id = createUrlRecordId('url-record-1')
 * urlRecordIdToString(id) // 'url-record-1'
 * ```
 */
export type UrlRecordId = string & {
  readonly [urlRecordIdBrand]: 'UrlRecordId'
}

/**
 * `UrlRecordId` 値オブジェクトを生成する。
 */
export const createUrlRecordId = (value: string): UrlRecordId => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SavedTabsDomainError(
      'UrlRecord ID は空文字列にできません',
      'INVALID_ID',
    )
  }
  // OK: createUrlRecordId は検証通過後のブランド型タグ付けに限定
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- branded primitive constructor boundary after runtime validation
  return value as UrlRecordId
}

/**
 * `UrlRecordId` を生文字列へ戻す。
 */
export const urlRecordIdToString = (id: UrlRecordId): string => id

/**
 * 2 つの `UrlRecordId` を比較する。
 */
export const equalsUrlRecordId = (a: UrlRecordId, b: UrlRecordId): boolean =>
  a === b

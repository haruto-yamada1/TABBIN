import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'

declare const tabGroupIdBrand: unique symbol

/**
 * `TabGroup` の識別子を表す不変値オブジェクト。
 *
 * 既存ストレージとの互換のため、内部表現は任意の非空文字列とする。
 * 採番アルゴリズム（UUID / nanoid など）は infrastructure 側に任せ、
 * domain 層では「形式が壊れていないか」だけを検証する。
 *
 * @example
 * ```ts
 * const id = createTabGroupId('domain-example-com')
 * tabGroupIdToString(id) // 'domain-example-com'
 * ```
 */
export type TabGroupId = string & { readonly [tabGroupIdBrand]: 'TabGroupId' }

/**
 * `TabGroupId` 値オブジェクトを生成する。
 */
export const createTabGroupId = (value: string): TabGroupId => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SavedTabsDomainError(
      'TabGroup ID は空文字列にできません',
      'INVALID_ID',
    )
  }
  // OK: createTabGroupId は検証通過後のブランド型タグ付けに限定
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return value as TabGroupId
}

/**
 * `TabGroupId` を生文字列へ戻す。
 */
export const tabGroupIdToString = (id: TabGroupId): string => id

/**
 * 2 つの `TabGroupId` を比較する。
 */
export const equalsTabGroupId = (a: TabGroupId, b: TabGroupId): boolean =>
  a === b

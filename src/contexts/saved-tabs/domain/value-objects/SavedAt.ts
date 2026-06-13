import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'

declare const savedAtBrand: unique symbol

/**
 * 保存タブの保存時刻（UNIX epoch ミリ秒）を表す不変値オブジェクト。
 *
 * `Date.now()` で得られる数値を想定する。0 以上の整数で、
 * `Number.isFinite` を満たす値のみ許容する。domain 層では値の妥当性のみ
 * 検証し、現在時刻取得の抽象化が必要な use-case では `Date.now()` を直接
 * 利用する（専用の port を導入する判断は use-case 側で個別に行う）。
 *
 * @example
 * ```ts
 * const savedAt = createSavedAt(1_700_000_000_000)
 * savedAtToMillis(savedAt) // 1700000000000
 * ```
 */
export type SavedAt = number & { readonly [savedAtBrand]: 'SavedAt' }

/**
 * `SavedAt` 値オブジェクトを生成する。
 *
 * 浮動小数や負の値、`NaN` / `Infinity` は不正値として扱う。
 */
export const createSavedAt = (value: number): SavedAt => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new SavedTabsDomainError(
      'savedAt は 0 以上の整数で指定してください',
      'INVALID_SAVED_AT',
    )
  }
  // OK: createSavedAt は検証通過後のブランド型タグ付けに限定
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return value as SavedAt
}

/**
 * `SavedAt` を生のミリ秒数値へ戻す。
 */
export const savedAtToMillis = (savedAt: SavedAt): number => savedAt

/**
 * 2 つの `SavedAt` を比較する。
 */
export const equalsSavedAt = (a: SavedAt, b: SavedAt): boolean => a === b

/**
 * `a` が `b` より過去かを判定する。
 */
export const isSavedAtBefore = (a: SavedAt, b: SavedAt): boolean => a < b

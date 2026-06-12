import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'

declare const urlBrand: unique symbol

/**
 * 保存タブで扱う URL を表す不変値オブジェクト。
 *
 * `WHATWG URL` でパースできる文字列だけを許容し、
 * `http(s):` / `chrome-extension:` / `file:` などのスキーム差は
 * 上位ポリシーで判定する。空文字列・空白のみ・パース失敗は
 * すべて `SavedTabsDomainError('INVALID_URL')` を投げる。
 *
 * @example
 * ```ts
 * const url = createUrl('https://example.com/docs')
 * urlToString(url) // 'https://example.com/docs'
 * ```
 */
export type Url = string & { readonly [urlBrand]: 'Url' }

/**
 * `Url` 値オブジェクトを生成する。
 *
 * 前後の空白は trim せず原文を保持する（保存済みデータと一致させるため）。
 * 不正値は `SavedTabsDomainError` を投げ、`message` には入力値を含めない。
 *
 * @example
 * ```ts
 * createUrl('https://example.com') // OK
 * createUrl('   ')                  // throws SavedTabsDomainError
 * ```
 */
export const createUrl = (value: string): Url => {
  if (typeof value !== 'string' || value.length === 0 || value.trim() === '') {
    throw new SavedTabsDomainError('URL は空文字列にできません', 'INVALID_URL')
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value)
  } catch {
    throw new SavedTabsDomainError('URL の形式が不正です', 'INVALID_URL')
  }
  // OK: createUrl は URL バリデーション通過後のブランド型タグ付けに限定
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Url
}

/**
 * `Url` を生文字列へ戻す。永続化層や UI へ渡すための変換口。
 */
export const urlToString = (url: Url): string => url

/**
 * 2 つの `Url` を文字列として比較する。大文字小文字差をそのまま扱う。
 */
export const equalsUrl = (a: Url, b: Url): boolean => a === b

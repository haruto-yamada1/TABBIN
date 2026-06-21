import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

declare const domainNameBrand: unique symbol

/**
 * 保存タブのドメイン名を表す不変値オブジェクト。
 *
 * `example.com` のような hostname を想定し、空文字列・空白のみ・
 * スキーム付き文字列（`https://...`）は不正値として扱う。
 * 比較を安定させるため、内部表現は小文字に正規化して保持する。
 *
 * @example
 * ```ts
 * const domain = createDomainName('Example.com')
 * domainNameToString(domain) // 'example.com'
 * ```
 */
export type DomainName = string & { readonly [domainNameBrand]: 'DomainName' }

const SCHEME_SEPARATOR = '://'

/**
 * `DomainName` 値オブジェクトを生成する。
 *
 * 入力は trim と小文字化のみを行い、`hostname` 抽出のような
 * 重い処理は行わない（呼び出し側で URL から hostname を取り出す前提）。
 */
export const createDomainName = (value: string): DomainName => {
  if (typeof value !== 'string') {
    throw new SavedTabsDomainError(
      'ドメイン名は文字列で指定してください',
      'INVALID_DOMAIN_NAME',
    )
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new SavedTabsDomainError(
      'ドメイン名は空文字列にできません',
      'INVALID_DOMAIN_NAME',
    )
  }
  if (trimmed.includes(SCHEME_SEPARATOR)) {
    throw new SavedTabsDomainError(
      'ドメイン名にスキームを含めることはできません',
      'INVALID_DOMAIN_NAME',
    )
  }
  // OK: createDomainName は正規化後のブランド型タグ付けに限定
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return trimmed.toLowerCase() as DomainName
}

/**
 * `DomainName` を生文字列へ戻す。永続化や UI へ渡すための変換口。
 */
export const domainNameToString = (domain: DomainName): string => domain

/**
 * 2 つの `DomainName` を比較する。生成時に正規化済みのため大小文字差は出ない。
 */
export const equalsDomainName = (a: DomainName, b: DomainName): boolean =>
  a === b

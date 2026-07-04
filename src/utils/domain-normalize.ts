/**
 * ドメイン文字列の正規化と等価比較のための共通ヘルパー。
 *
 * このリポジトリのストレージ層では、`TabGroup.domain` や
 * `ParentCategory.domainNames` が `https://example.com` のように
 * スキーム付きで書き込まれる既有データと、hostname 形 (`example.com`)
 * の新規データが混在し得る。直接 `===` / `.includes()` で比較すると
 * 形式差で silent にミスマッチし、分類やマッチングが壊れる。
 *
 * そのためドメイン値の比較は本ヘルパー経由で lookup key 化して行う
 * (Finding B の防御)。`lib/storage/migration` の旧 private 版を
 * 共通化したもの (Finding C の重複解消)。
 */

/**
 * ドメイン値を比較用の lookup key へ正規化する。
 * trim + 小文字化し、スキーム付きなら hostname を取り出す。
 * パース失敗時は入力の trim+小文字化をそのまま返す。
 *
 * `https://example.com` / `example.com` / `Example.COM` は
 * すべて `example.com` になるため、形式差を吸収して同ドメインを一致させる。
 */
export const normalizeDomainLookupKey = (domain: string): string => {
  const trimmed = domain.trim().toLowerCase()
  if (!trimmed.includes('://')) {
    return trimmed
  }
  try {
    return new URL(trimmed).hostname
  } catch {
    return trimmed
  }
}

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

/**
 * URL 文字列から hostname を取り出す。不正 URL は例外を投げず空文字列を返す。
 *
 * `src/lib/storage/projects.ts` / `src/lib/storage/project-keywords.ts` /
 * `src/features/ai-chat/lib/buildAiContext.ts` に分散していた
 * `getDomainFromUrl` を一本化したもの (CodeRabbit PR #626 review)。
 * 呼び出し側は savable URL で呼ぶ前提だが、不正値でも投げず `''` を返すことで
 * 保存/マッチングの silent 失敗を防ぐ。
 */
export const toHostname = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 2 つのドメイン値が正規化後に等価かを判定する。
 * `normalizeDomainLookupKey` 経由でスキーム付き/hostname の形式差を吸収する。
 *
 * ただし両辺のいずれかが空文字列に正規化される (host が取れない等) 場合は
 * 一致とみなさない。これにより不正 URL 同士や空ドメイン同士が同じ bucket に
 * マージされる空衝突を防ぐ (CodeRabbit PR #626 review)。
 */
export const domainMatches = (a: string, b: string): boolean => {
  const keyA = normalizeDomainLookupKey(a)
  const keyB = normalizeDomainLookupKey(b)
  return keyA !== '' && keyB !== '' && keyA === keyB
}

/**
 * `domainNames` 配列の中に `domain` と等価なエントリが存在するかを判定する。
 * `normalizeDomainLookupKey` 比較を 1 箇所に集約し、`assignDomainToCategory` /
 * `assignGroupToCategory` / `findCategoryByDomainName` 等での
 * `domainNames.some((name) => normalizeDomainLookupKey(name) === key)`
 * の重複を解消する (CodeRabbit PR #626 review)。
 */
export const hasNormalizedDomain = (
  domainNames: readonly string[],
  domain: string,
): boolean => domainNames.some((name) => domainMatches(name, domain))

/**
 * TabGroup が ParentCategory に所属するかを判定する共有 predicate。
 * `category.domains` (TabGroupId リスト) に group id が含まれるか、
 * `category.domainNames` に group の domain と等価なエントリがあるか。
 *
 * `useCategoryKeywordModal` と `buildAiContext` で重複していた
 * 「`domains.includes(id)` || `hasNormalizedDomain(domainNames, domain)`」を集約し、
 * ドリフトを防ぐ (CodeRabbit PR #626 review)。
 */
export const tabGroupMatchesCategory = (
  categoryDomainIds: readonly string[],
  categoryDomainNames: readonly string[],
  tabGroupId: string,
  tabGroupDomain: string,
): boolean =>
  categoryDomainIds.includes(tabGroupId) ||
  hasNormalizedDomain(categoryDomainNames, tabGroupDomain)

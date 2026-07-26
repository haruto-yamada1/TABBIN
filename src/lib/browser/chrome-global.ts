/**
 * ブラウザ拡張機能の `chrome` API へ安全にアクセスするためのヘルパー。
 *
 * `globalThis` 上に `chrome` が存在しない環境（テスト・SSR・Node
 * 環境等）でもビルドが壊れないよう、`unknown` と validator で境界を
 * 明示してから呼び出し側の最小 chrome shape へ絞り込む。
 */

export const isObjectLike = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

export const getChromeGlobal = <T>(
  isChromeApi: (value: unknown) => value is T,
): T | undefined => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  return isChromeApi(chromeValue) ? chromeValue : undefined
}

/**
 * ブラウザ拡張機能の `chrome` API へ安全にアクセスするためのヘルパー。
 *
 * `globalThis` 上に `chrome` が存在しない環境（テスト・SSR・Node
 * 環境等）でもビルドが壊れないよう、存在チェック + 型拡張を 1 か所
 * に閉じている。`as unknown as typeof globalThis & { chrome?: T }`
 * の構造的キャストはここで 1 度だけ行い、呼び出し側は disable 不要。
 */

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 呼び出し側で `getChromeGlobal<ChromeApiLike>()` のように型指定する。明示的な型指定の方がテスト・lint での追跡性が高い
export const getChromeGlobal = <T>(): T | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- chrome.* は extension 環境でのみ存在。globalThis 拡張は型定義に chrome が無いためキャストが不可避
  return (globalThis as typeof globalThis & { chrome?: T }).chrome
}

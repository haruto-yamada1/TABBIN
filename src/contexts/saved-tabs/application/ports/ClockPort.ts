/**
 * 現在時刻の取得を application / infrastructure から注入するための port。
 *
 * domain 層は現在時刻へ直接依存してはならず (`.oxlintrc.json` の
 * `no-restricted-properties` と `dddLayerGuard.test.ts` で検出)。
 * 現在時刻が必要な use-case は本 port 経由で `now()` を呼び、
 * 取得した値を domain value object (例: `createSavedAt`) へ渡す。
 *
 * 戻り値は `SavedAt` value object が前提とする UNIX epoch ミリ秒
 * (`number`) とする。`Date` オブジェクトへの変換は呼び出し側の
 * 責務に任せ、port 自体は epoch ms のみを返す。
 *
 * @example
 * ```ts
 * const now = clock.now()
 * const savedAt = createSavedAt(now)
 * ```
 */
export type ClockPort = {
  readonly now: () => number
}

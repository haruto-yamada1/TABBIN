/**
 * 現在時刻取得を抽象化する port。
 *
 * domain 層は「副作用なし」を保つため `Date.now()` を直接呼ばない。
 * 代わりに use-case が本 port を介して現在時刻を取得し、entity 化する
 * ときの `savedAt` や `updatedAt` に利用する。
 *
 * infrastructure 層が `SystemClockAdapter`（`Date.now()` を返す）と
 * `FixedClockAdapter`（テスト用に固定値を返す）を提供することを想定。
 *
 * @example
 * ```ts
 * const now = clockPort.now() // number (epoch ms)
 * const record = createUrlRecord({ ..., savedAt: now })
 * ```
 */
export interface ClockPort {
  /**
   * 現在の epoch ミリ秒を返す。
   */
  now: () => number
}

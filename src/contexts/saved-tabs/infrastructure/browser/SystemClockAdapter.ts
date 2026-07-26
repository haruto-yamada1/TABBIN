import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'

/**
 * `Date.now()` を `ClockPort` に適合させる adapter。
 *
 * 現在時刻の取得を `Date.now()` に直接依存するのは infrastructure 層の
 * 責務であり、application / domain 層は本 adapter 経由で注入された
 * `ClockPort` を利用する。テストでは固定時刻を返す stub に差し替える。
 */
export const createSystemClock = (): ClockPort => ({
  now: () => Date.now(),
})

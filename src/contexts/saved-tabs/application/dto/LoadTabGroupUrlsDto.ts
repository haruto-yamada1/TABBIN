import type { TabGroup } from '@/types/storage'

/**
 * `LoadTabGroupUrlsUseCase` の結果 DTO。
 *
 * 単一 `TabGroup` に対して URL 解決した URL レコード配列を返す。
 * 旧 `src/lib/storage/tabs.getTabGroupUrls(group)` の戻り値と
 * 同じ形（`UrlRecord & { subCategory? }` の配列）。
 *
 * 実体は storage `TabGroup.urls` の要素型と互換。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */
export type LoadTabGroupUrlsDtoUrls = NonNullable<TabGroup['urls']>

export interface LoadTabGroupUrlsDto {
  readonly urls: LoadTabGroupUrlsDtoUrls
}

// `TabGroup` 型が unused 警告で落ちないようにするための marker。
export type _LoadTabGroupUrlsTabGroupMarker = TabGroup

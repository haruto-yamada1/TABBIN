import type { CollectionProjectionDto } from './CollectionProjectionDto'
import type { ResolvedTabGroupUrlDto } from './ResolvedTabGroupUrlDto'

/**
 * `SavedTabsCategorizationService` / `SavedTabsDisplayPolicy` /
 * `TabGroupUrlReorderer` / `TabGroupUrlResolver` が受け取る
 * `TabGroup` の domain 入力 DTO (issue #511)。
 *
 * persistence DTO から補助フィールドを除き、URL の所属関係を
 * `memberships` として表現する current domain DTO。
 *
 * branded な `TabGroup` entity (値オブジェクト) ではなく
 * plain string ベースとしている理由:
 * - `SavedTabsCategorizationService` は `Record<string, TabGroup[]>`
 *   のキーや `Map.get()` のキーを `string` キーで扱う
 * - `TabGroupUrlResolver` の `urls` 解決後に再び `TabGroup` 配列を
 *   組み直すため、entity factory を通すと service 内の値変換が増えて
 *   しまう
 *
 * mapper / service が結果を再構成できるよう配列フィールドは mutable とする。
 */
export type TabGroupDto = CollectionProjectionDto & {
  readonly resolvedUrls?: readonly ResolvedTabGroupUrlDto[]
}

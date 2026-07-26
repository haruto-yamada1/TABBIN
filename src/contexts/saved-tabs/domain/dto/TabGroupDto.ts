import type { ResolvedTabGroupUrlDto } from './ResolvedTabGroupUrlDto'

/**
 * `SavedTabsCategorizationService` / `SavedTabsDisplayPolicy` /
 * `TabGroupUrlReorderer` / `TabGroupUrlResolver` が受け取る
 * `TabGroup` の domain 入力 DTO (issue #511)。
 *
 * `@/types/storage.TabGroup` から chrome.storage 専用の
 * 補助フィールド (`subCategories` / `categoryKeywords` /
 * `subCategoryOrder` / `subCategoryOrderWithUncategorized`) を
 * 除いた構造互換 DTO。`urlSubCategories` は `TabGroupUrlResolver`
 * が subCategory 引き継ぎに使うため DTO に残す。
 *
 * branded な `TabGroup` entity (値オブジェクト) ではなく
 * plain string ベースとしている理由:
 * - `SavedTabsCategorizationService` は `Record<string, TabGroup[]>`
 *   のキーや `Map.get()` のキーを `string` キーで扱う
 * - `TabGroupUrlResolver` の `urls` 解決後に再び `TabGroup` 配列を
 *   組み直すため、entity factory を通すと service 内の値変換が増えて
 *   しまう
 *
 * 配列 / オブジェクトフィールドは `@/types/storage.TabGroup` との
 * structural 互換のため readonly 修飾を敢えて付けず、mutable
 * として公開する (presentation 側 context が `TabGroup` 形の
 * `urlIds?: string[]` を props として受け取る既存コンポーネント
 * との代入互換を取る)。
 */
export type TabGroupDto = {
  id: string
  domain: string
  parentCategoryId?: string
  urlIds?: string[]
  urls?: ResolvedTabGroupUrlDto[]
  urlSubCategories?: Record<string, string>
  savedAt?: number
}

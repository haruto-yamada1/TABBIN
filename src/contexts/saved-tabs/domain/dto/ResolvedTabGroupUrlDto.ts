/**
 * `TabGroupUrlResolver.resolveGroupUrls` が返す URL 解決済み要素の
 * domain DTO (issue #511)。
 *
 * `@/types/storage.TabGroup['urls']` の要素型と構造互換。
 * `id` と `savedAt` は URL 解決後に必ず存在するが、storage 形の
 * `urls` 要素型では optional のため optional 維持とする。
 */
export type ResolvedTabGroupUrlDto = {
  id?: string
  url: string
  title: string
  subCategory?: string
  savedAt?: number
}

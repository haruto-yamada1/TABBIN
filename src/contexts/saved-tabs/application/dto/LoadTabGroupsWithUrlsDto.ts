import type { TabGroup } from '@/types/storage'

/**
 * `LoadTabGroupsWithUrlsUseCase` の結果 DTO。
 *
 * URL 解決済み `TabGroup[]` をそのまま返す。各 `TabGroup` には
 * 入力と同じ id / domain / urlIds / urlSubCategories などの
 * rich 補助フィールドが保持され、`urls` フィールドだけが
 * `UrlRecord & { subCategory? }` 配列で追加される。
 *
 * `urlSubCategories` 引き継ぎは use-case / domain サービス側で
 * 行い、presentation 層は結果を受け取って表示に使うだけにする
 * （issue #501）。
 */
export interface LoadTabGroupsWithUrlsDto {
  readonly tabGroups: readonly TabGroup[]
}

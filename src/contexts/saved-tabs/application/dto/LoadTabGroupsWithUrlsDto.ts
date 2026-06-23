import type { SavedTabsDisplayTabGroupDto } from './SavedTabsPresentationDto'

/**
 * `LoadTabGroupsWithUrlsUseCase` の結果 DTO。
 *
 * URL 解決済み `TabGroupDto[]` をそのまま返す。各 `TabGroupDto` には
 * 入力と同じ id / domain / urlIds などのフィールドが保持され、
 * `urls` フィールドだけが `ResolvedTabGroupUrlDto[]` で追加される。
 *
 * `urlSubCategories` 引き継ぎは use-case / domain サービス側で
 * 行い、presentation 層は結果を受け取って表示に使うだけにする
 * （issue #501）。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` だけを
 * 返す (issue #511)。
 */
export interface LoadTabGroupsWithUrlsDto {
  readonly tabGroups: readonly SavedTabsDisplayTabGroupDto[]
}

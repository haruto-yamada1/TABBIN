import type { ResolvedTabGroupUrlDto } from '@/contexts/saved-tabs/domain/dto/ResolvedTabGroupUrlDto'

/**
 * `LoadTabGroupUrlsUseCase` の戻り値 DTO。
 *
 * 単一 `TabGroupDto` に対する URL 解決済み URL レコード配列を返す。
 * 旧 `src/lib/storage/tabs.getTabGroupUrls(group)` の戻り値と互換。
 *
 * `@/types/storage` には依存せず、domain DTO `ResolvedTabGroupUrlDto`
 * だけを返す (issue #511)。
 */
export interface LoadTabGroupUrlsDto {
  readonly urls: readonly ResolvedTabGroupUrlDto[]
}

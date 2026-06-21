import type { TabGroupDto } from '@/contexts/saved-tabs/domain/dto/TabGroupDto'

/**
 * `LoadTabGroupUrlsUseCase` の入力。
 *
 * 単一の `TabGroupDto` を渡し、URL 解決済み URL レコード配列を返す。
 * 旧 `src/lib/storage/tabs.getTabGroupUrls(group)` の等価物。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` を
 * 受け取る (issue #511)。
 */
export interface LoadTabGroupUrlsCommand {
  readonly tabGroup: TabGroupDto
}

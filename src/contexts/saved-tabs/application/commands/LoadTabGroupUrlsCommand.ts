import type { TabGroup } from '@/types/storage'

/**
 * `LoadTabGroupUrlsUseCase` の入力。
 *
 * 単一の `TabGroup` を渡し、URL 解決済み URL レコード配列を返す。
 * 旧 `src/lib/storage/tabs.getTabGroupUrls(group)` の等価物。
 *
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 */
export interface LoadTabGroupUrlsCommand {
  readonly tabGroup: TabGroup
}

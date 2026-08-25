import type { TabGroupDto } from '@/contexts/saved-tabs/domain/dto/TabGroupDto'

/**
 * `SavedTabsApp` 内の pure な表示判定ロジックを domain 側へ集約した
 * ポリシー (issue #496)。
 *
 * UI 表示上「ノードとして数えられる URL を保持するグループ」かを判定する。
 * 新形式 (`urlIds`) と旧形式 (`urls`) の両方を考慮し、`SavedTabsApp` 内の
 * 旧 `hasDisplayableUrls` と同じ判定結果を返す。
 *
 * 旧実装にあった `console.log` デバッグ出力は domain 層では省略している
 * （純粋関数としてのシグナル/ノイズ比を改善し、テスト時のログ汚染を防ぐため）。
 *
 * `@/types/storage.TabGroup` ではなく domain DTO `TabGroupDto` を
 * 受け取る (issue #511)。DTO は構造互換なので挙動は変わらない。
 *
 * @example
 * ```ts
 * hasDisplayableUrls({ id: 'g1', domain: 'example.com', urlIds: ['u1'] }) // true
 * hasDisplayableUrls({ id: 'g1', domain: 'example.com' })                 // false
 * ```
 */
export const hasDisplayableUrls = (group: TabGroupDto): boolean => {
  return group.memberships.length > 0 || (group.resolvedUrls?.length ?? 0) > 0
}

/**
 * 描画用に「表示対象」とみなせる URL 数を返す。
 *
 * `urls` フィールドが優先で、なければ `urlIds` にフォールバックする
 * （旧形式タブグループ対応）。両方未定義 / 空配列のときは 0。
 *
 * UI 側で「表示対象グループかどうか」を判定する共通基準として使う
 * pure 関数 (issue #504)。
 *
 * @example
 * ```ts
 * getDisplayUrlCount({ id: 'g1', domain: 'a', urls: [u1, u2] })   // 2
 * getDisplayUrlCount({ id: 'g1', domain: 'a', urlIds: ['u1'] })  // 1
 * getDisplayUrlCount({ id: 'g1', domain: 'a' })                  // 0
 * ```
 */
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

export const getDisplayUrlCount = (group: TabGroup): number =>
  (group.urls ?? group.memberships ?? []).length

/**
 * ヘッダー / 空状態判定用に、CustomProject を `TabGroup` 形に投影する。
 *
 * `domain` には project 名を流用し、`urls` / `urlIds` は未定義時は
 * 空配列として詰める。presentation 層が `TabGroup` 形を要求する
 * ヘッダー描画や、空状態判定でのみ使う。
 *
 * UI 専用整形のため、storage shape (`TabGroup`) への詰め替えは
 * 完全一致でなくてよい (issue #504)。
 *
 * @example
 * ```ts
 * buildDisplayTabGroup({ id: 'p1', name: 'My Project', urlIds: ['u1'] })
 * // => { id: 'p1', domain: 'My Project', urls: [], urlIds: ['u1'] }
 * ```
 */
export const buildDisplayTabGroup = (project: CustomProject): TabGroup => ({
  id: project.id,
  domain: project.name,
  ...(project.memberships
    ? {
        memberships: project.memberships.map((membership) => ({
          ...membership,
        })),
      }
    : {}),
  urls: project.urls ?? [],
})

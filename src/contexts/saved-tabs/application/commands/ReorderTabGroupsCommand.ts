import type { TabGroup } from '../../domain/entities/TabGroup'

/**
 * `ReorderTabGroupsUseCase` の入力。
 *
 * 未分類ドメインのドラッグ並び替えを確定するときに、UI 側で
 * `[...categorizedDomains, ...tempUncategorizedOrder]` の形に
 * 並べ替えた完全な一覧を渡す。use-case はそのまま
 * `TabGroupRepository.saveAll` に委譲する（issue #494）。
 */
export interface ReorderTabGroupsCommand {
  readonly tabGroups: readonly TabGroup[]
}

import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

/**
 * presentation 層が「保存タブ一覧の生データ」を必要とするときの
 * application query。`useTabData.refreshTabGroupsWithUrls` の引数なし
 * 経路や、`SyncCategoryAssignmentsUseCase` のような全件再判定の前段で
 * 利用する。
 *
 * 既存の `GetSavedTabsPageDataQuery` は `tabGroups` + `parentCategories` +
 * `userSettings` をバンドルで返すページ初期化向けスナップショット。
 * 一方、本 query は `tabGroups` だけを必要とする軽量経路 (issue #517) を
 * 担い、presentation 層が `TabGroupRepository` を直接 import する
 * 経路を 1 本閉じる。
 *
 * 返り値は branded domain entity の `readonly TabGroup[]` を維持し、
 * 呼び出し側で `readonly` 性を保ったまま扱えるようにしている。
 */
export type GetSavedTabsQuery = () => Promise<readonly TabGroup[]>

/**
 * `GetSavedTabsQuery` が依存する repository 群。
 */
export interface GetSavedTabsQueryDeps {
  readonly tabGroupRepository: TabGroupRepository
}

/**
 * `GetSavedTabsQuery` を生成する。
 *
 * 責務は `tabGroupRepository.findAll()` を呼び出して
 * `readonly TabGroup[]` を返すだけ。schema 変更や shape 変換は行わない。
 *
 * @example
 * ```ts
 * const getSavedTabs = createGetSavedTabsQuery({ tabGroupRepository })
 * const tabGroups = await getSavedTabs()
 * ```
 */
export const createGetSavedTabsQuery = (
  deps: GetSavedTabsQueryDeps,
): GetSavedTabsQuery => {
  return async () => deps.tabGroupRepository.findAll()
}

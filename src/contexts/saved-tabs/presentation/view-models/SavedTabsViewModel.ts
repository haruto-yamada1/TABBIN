import type { CustomProjectViewModel } from './CustomProjectViewModel'
import type { TabGroupViewModel } from './TabGroupViewModel'

/**
 * presentation 層で扱う SavedTabsPage 全体の view-model。
 *
 * controller hook (`useSavedTabsController`) が use-case 実行結果と
 * 読み込み状態を組み合わせ、`SavedTabsPage` へそのまま渡す。
 *
 * UI コンポーネントは view-model だけを描画し、use-case の戻り値型や
 * domain entity を直接参照しない。これにより presentation 層が
 * application 層 interface 変更に振り回されにくくなる。
 */
export interface SavedTabsViewModel {
  readonly loading: boolean
  readonly error: string | null
  readonly tabGroups: readonly TabGroupViewModel[]
  readonly customProjects: readonly CustomProjectViewModel[]
  readonly displayCount: number
  readonly hasContent: boolean
}

/**
 * 空の view-model を返す factory。loading 初期状態や error 時に使う。
 */
export const createEmptySavedTabsViewModel = (): SavedTabsViewModel => ({
  customProjects: [],
  displayCount: 0,
  error: null,
  hasContent: false,
  loading: true,
  tabGroups: [],
})

/**
 * 任意の `tabGroups` / `customProjects` から view-model を構築する。
 *
 * 純粋関数として切り出すことで、controller hook の責務は
 * 「repository / use-case を呼び、結果をこの関数へ流す」だけになる。
 */
export const createSavedTabsViewModel = ({
  loading,
  error,
  tabGroups,
  customProjects,
}: {
  loading: boolean
  error: string | null
  tabGroups: readonly TabGroupViewModel[]
  customProjects: readonly CustomProjectViewModel[]
}): SavedTabsViewModel => {
  const displayCount =
    tabGroups.reduce((total, group) => total + group.displayUrlCount, 0) +
    customProjects.reduce(
      (total, project) => total + project.displayUrlCount,
      0,
    )
  return {
    customProjects,
    displayCount,
    error,
    hasContent: tabGroups.length > 0 || customProjects.length > 0,
    loading,
    tabGroups,
  }
}

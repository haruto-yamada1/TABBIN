import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'

import { buildDisplayTabGroup, getDisplayUrlCount } from './display-tab-group'
import { shouldShowUncategorizedHeader } from './uncategorized-display'

/**
 * `CategorizedDisplayState` への入力。
 *
 * `SavedTabsApp.tsx` が保持する `categorized` / `uncategorized` /
 * 並び替え中の一時順序 / 検索クエリ / viewMode / カテゴリ表示設定から
 * 描画に必要な派生 state をまとめて組み立てるための pure 関数入力。
 *
 * React / chrome API / storage には依存しない (issue #504)。
 */
export interface CreateCategorizedDisplayStateInput {
  readonly categorized: Readonly<Record<string, readonly TabGroup[]>>
  readonly uncategorized: readonly TabGroup[]
  readonly tempUncategorizedOrder: readonly TabGroup[]
  readonly isUncategorizedReorderMode: boolean
  readonly enableCategories: boolean
  readonly searchQuery: string
  readonly viewMode: ViewMode
  readonly filteredCustomProjects: readonly CustomProject[]
}

/**
 * カテゴリ分類済み / 未分類のタブグループから UI 派生 state を組み立てる。
 *
 * - `hasContentTabGroups` : カテゴリ + 未分類のうち表示対象 URL を持つ
 *   グループのフラット配列。`Header` への件数表示と `hasContentCount` 判定用
 * - `visibleUncategorizedGroups` : 未分類のうち表示対象 URL を持つグループ
 *   （並び替えモードの一時順序は反映しない）
 * - `hasVisibleCategoryGroups` : カテゴリ表示が有効かつ分類済みカテゴリが
 *   1 件以上存在するか
 * - `shouldShowUncategorizedSectionHeader` : 未分類セクション見出しを
 *   表示するかどうか
 * - `shouldShowUncategorizedList` : 未分類グループリスト本体を描画するか
 * - `uncategorizedForDisplay` : 並び替えモード時は一時順序、通常時は
 *   フィルタ済み `uncategorized` を表示対象 URL のみへ絞り込んだ配列
 * - `headerFilteredTabGroups` : ヘッダー用のフィルタ済み表示配列
 *   （domain モードでは `hasContentTabGroups`、custom モードでは
 *   `filteredCustomProjects` を `buildDisplayTabGroup` で投影）
 *
 * 旧 `SavedTabsApp.tsx` 内の同名の useMemo / 計算式を
 * domain-independent な pure 関数として切り出したもの (issue #504)。
 */
export interface CategorizedDisplayState {
  readonly hasContentTabGroups: TabGroup[]
  readonly visibleUncategorizedGroups: TabGroup[]
  readonly hasVisibleCategoryGroups: boolean
  readonly shouldShowUncategorizedSectionHeader: boolean
  readonly shouldShowUncategorizedList: boolean
  readonly uncategorizedForDisplay: TabGroup[]
  readonly headerFilteredTabGroups: TabGroup[]
}

const filterByDisplayableUrls = (groups: readonly TabGroup[]): TabGroup[] =>
  groups.filter((group) => getDisplayUrlCount(group) > 0)

const buildHeaderFilteredTabGroups = ({
  filteredCustomProjects,
  hasContentTabGroups,
  viewMode,
}: {
  readonly filteredCustomProjects: readonly CustomProject[]
  readonly hasContentTabGroups: TabGroup[]
  readonly viewMode: ViewMode
}): TabGroup[] => {
  if (viewMode === 'domain') {
    return hasContentTabGroups
  }
  return filteredCustomProjects.map((project) => buildDisplayTabGroup(project))
}

export const createCategorizedDisplayState = ({
  categorized,
  enableCategories,
  filteredCustomProjects,
  isUncategorizedReorderMode,
  searchQuery,
  tempUncategorizedOrder,
  uncategorized,
  viewMode,
}: CreateCategorizedDisplayStateInput): CategorizedDisplayState => {
  const hasContentTabGroups = filterByDisplayableUrls([
    ...Object.values(categorized).flat(),
    ...uncategorized,
  ])
  const visibleUncategorizedGroups = filterByDisplayableUrls(uncategorized)
  const hasVisibleCategoryGroups =
    enableCategories && Object.keys(categorized).length > 0
  const shouldShowUncategorizedSectionHeader =
    enableCategories &&
    shouldShowUncategorizedHeader({
      isUncategorizedReorderMode,
      searchQuery,
      uncategorizedCount: uncategorized.length,
      visibleUncategorizedCount: visibleUncategorizedGroups.length,
    })
  const shouldShowUncategorizedList = visibleUncategorizedGroups.length > 0
  const uncategorizedForDisplay = filterByDisplayableUrls(
    isUncategorizedReorderMode ? tempUncategorizedOrder : uncategorized,
  )
  const headerFilteredTabGroups = buildHeaderFilteredTabGroups({
    filteredCustomProjects,
    hasContentTabGroups,
    viewMode,
  })

  return {
    hasContentTabGroups,
    hasVisibleCategoryGroups,
    headerFilteredTabGroups,
    shouldShowUncategorizedList,
    shouldShowUncategorizedSectionHeader,
    uncategorizedForDisplay,
    visibleUncategorizedGroups,
  }
}

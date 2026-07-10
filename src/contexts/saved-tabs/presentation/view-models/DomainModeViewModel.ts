import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

import type { CustomProjectViewModel } from './CustomProjectViewModel'
import type { TabGroupViewModel } from './TabGroupViewModel'
import { toTabGroupViewModel } from './TabGroupViewModel'

/**
 * presentation 層で扱う Domain モード用 view-model。
 *
 * `SavedTabsViewModel` の `tabGroups` を mode 単位に再整形し、
 * category 割当・検索フィルタ・並び替え状態などの UI 派生値を含める。
 * `useDomainModeController` が組み立て、`DomainModeContainer` が受け取る。
 */
export type DomainModeViewModel = {
  readonly loading: boolean
  readonly error: string | null
  readonly tabGroups: readonly TabGroupViewModel[]
  readonly customProjects: readonly CustomProjectViewModel[]
  readonly displayCount: number
  readonly hasContent: boolean
  readonly searchQuery: string
  readonly categories: readonly ParentCategoryViewModel[]
}

export type ParentCategoryViewModel = {
  readonly id: string
  readonly name: string
  readonly domains: readonly string[]
  readonly domainNames: readonly string[]
}

/**
 * 親カテゴリを view-model へ変換する純関数。
 */
export const toParentCategoryViewModel = (
  category: ParentCategory,
): ParentCategoryViewModel => ({
  domainNames: [...category.domainNames],
  domains: [...category.domains],
  id: category.id,
  name: category.name,
})

/**
 * `createDomainModeViewModel` への入力。
 *
 * 既存 `SavedTabsViewModel` 側は domain entity (`TabGroup` / `ParentCategory`)
 * を直接受け取れるよう widening している。presentation 層が storage 形状
 * (branded 型なし) を扱うケースも、controller 側で entity へ詰め替えるか
 * `unknown` キャストで吸収する。
 */
export type CreateDomainModeViewModelInput = {
  readonly loading: boolean
  readonly error: string | null
  readonly tabGroups: readonly TabGroup[]
  readonly customProjects: readonly CustomProjectViewModel[]
  readonly categories: readonly ParentCategory[]
  readonly searchQuery: string
}

/**
 * Domain モード用 view-model を組み立てる。
 *
 * - `tabGroups` を view-model 配列へ変換
 * - `categories` を view-model 配列へ変換
 * - 検索クエリは normalized したうえでそのまま保持し、絞り込みは
 *   controller 側 (`useDomainModeController`) で行う
 */
export const createDomainModeViewModel = ({
  loading,
  error,
  tabGroups,
  customProjects,
  categories,
  searchQuery,
}: CreateDomainModeViewModelInput): DomainModeViewModel => {
  const tabGroupViewModels = tabGroups.map(toTabGroupViewModel)
  const categoryViewModels = categories.map(toParentCategoryViewModel)
  const displayCount = tabGroupViewModels.reduce(
    (total, group) => total + group.displayUrlCount,
    0,
  )
  return {
    categories: categoryViewModels,
    customProjects,
    displayCount,
    error,
    hasContent: tabGroupViewModels.length > 0 || customProjects.length > 0,
    loading,
    searchQuery,
    tabGroups: tabGroupViewModels,
  }
}

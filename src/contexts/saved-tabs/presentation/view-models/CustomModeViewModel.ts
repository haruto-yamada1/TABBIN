import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'

import type { CustomProjectViewModel } from './CustomProjectViewModel'
import { toCustomProjectViewModel } from './CustomProjectViewModel'

/**
 * presentation 層で扱う Custom モード用 view-model。
 *
 * カスタムプロジェクト一覧と検索クエリ、合計 URL 数を保持する。
 * `useCustomModeController` が組み立て、`CustomModeContainer` が受け取る。
 */
export interface CustomModeViewModel {
  readonly loading: boolean
  readonly error: string | null
  readonly projects: readonly CustomProjectViewModel[]
  readonly searchQuery: string
  readonly displayCount: number
  readonly hasContent: boolean
}

export interface CreateCustomModeViewModelInput {
  readonly loading: boolean
  readonly error: string | null
  readonly projects: readonly CustomProject[]
  readonly searchQuery: string
}

/**
 * Custom モード用 view-model を組み立てる。
 *
 * - `projects` を view-model 配列へ変換
 * - 検索クエリは normalized したうえでそのまま保持し、絞り込みは
 *   controller 側 (`useCustomModeController`) で行う
 */
export const createCustomModeViewModel = ({
  loading,
  error,
  projects,
  searchQuery,
}: CreateCustomModeViewModelInput): CustomModeViewModel => {
  const projectViewModels = projects.map(toCustomProjectViewModel)
  const displayCount = projectViewModels.reduce(
    (total, project) => total + project.displayUrlCount,
    0,
  )
  return {
    displayCount,
    error,
    hasContent: projectViewModels.length > 0,
    loading,
    projects: projectViewModels,
    searchQuery,
  }
}

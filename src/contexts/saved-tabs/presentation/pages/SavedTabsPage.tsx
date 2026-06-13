import { useEffect, useMemo, useRef } from 'react'

import type { CustomProject } from '../../domain/entities/CustomProject'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { SavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import { createSavedTabsUseCasesContextValueFromDeps } from '../controllers/SavedTabsUseCasesContext'
import { useSavedTabsController } from '../controllers/useSavedTabsController'
import type { SavedTabsViewModel } from '../view-models/SavedTabsViewModel'

/**
 * `SavedTabsPage` の props。
 *
 * - `deps` / `useCases` を渡すと composition 済みの use-case が使える。
 *   未指定なら `createSavedTabsUseCasesContextValue()` を内部で生成する。
 * - `initialTabGroups` / `initialCustomProjects` は SSR / Storybook 用に
 *   事前データを渡す補助。テストで repository を差し替えずに view-model を
 *   検証したいときに使う。
 */
export interface SavedTabsPageProps {
  readonly deps?: SavedTabsUseCasesDeps
  readonly useCases?: SavedTabsUseCases
  readonly initialTabGroups?: readonly TabGroup[]
  readonly initialCustomProjects?: readonly CustomProject[]
}

/**
 * `SavedTabsPage` 内部の controller 状態。
 *
 * ページ → controller フック → use-case → repository / port の流れを
 * 一度だけ確立し、その戻り値を layout へ流す。
 */
export interface SavedTabsPageState {
  readonly viewModel: SavedTabsViewModel
  readonly refresh: () => Promise<void>
  readonly controller: ReturnType<typeof useSavedTabsController>
}

/**
 * `SavedTabsPage` のロジック hook。
 *
 * `SavedTabsPage` コンポーネントから分離してテスト可能にしている。
 * コンポーネント側は view-model と controller を layout へ流すだけ。
 */
export const useSavedTabsPage = (
  input: SavedTabsPageProps,
): SavedTabsPageState => {
  if (!input.deps) {
    throw new Error(
      'SavedTabsPage: deps is required. Use createSavedTabsUseCasesContextValue() at the call site for chrome real environment.',
    )
  }
  const deps: SavedTabsUseCasesDeps = input.deps
  const contextValue = useMemo(
    () =>
      input.useCases
        ? { deps, useCases: input.useCases }
        : createSavedTabsUseCasesContextValueFromDeps(deps),
    [deps, input.useCases],
  )
  const controller = useSavedTabsController({
    deps: contextValue.deps,
    initialCustomProjects: input.initialCustomProjects,
    initialTabGroups: input.initialTabGroups,
    useCases: contextValue.useCases,
  })
  const refreshRef = useRef(controller.refresh)
  if (refreshRef.current !== controller.refresh) {
    refreshRef.current = controller.refresh
  }
  const hasInitialData = Boolean(
    input.initialTabGroups ?? input.initialCustomProjects,
  )
  const hasInitialDataRef = useRef(hasInitialData)
  if (hasInitialDataRef.current !== hasInitialData) {
    hasInitialDataRef.current = hasInitialData
  }
  useEffect(() => {
    if (hasInitialDataRef.current) {
      return
    }
    void refreshRef.current()
    // refresh は deps.customProjectRepository / deps.tabGroupRepository が
    // 変わったときだけ新しくなる。初回 mount 時に 1 回だけ走ればよいため、
    // ここでは依存配列を空にして再実行を抑止する。
    // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  }, [])
  return {
    controller,
    refresh: controller.refresh,
    viewModel: controller.viewModel,
  }
}

/**
 * `SavedTabsPage` コンポーネント。
 *
 * presentation 層 page の薄い shell。controller フックを呼んで
 * view-model を取り出し、layout 系の子要素へ流す。
 *
 * 旧 `SavedTabsApp` の layout 互換は別 issue（またはこの issue の
 * フォローアップ）で `SavedTabsPresentationLayout` を作って差し替える。
 */
export const SavedTabsPage = (props: SavedTabsPageProps) => {
  const { viewModel, refresh } = useSavedTabsPage(props)
  return (
    <div
      data-testid='saved-tabs-page-presentation'
      data-loading={viewModel.loading ? 'true' : 'false'}
      data-error={viewModel.error ?? ''}
      data-has-content={viewModel.hasContent ? 'true' : 'false'}
    >
      <p data-testid='saved-tabs-page-display-count'>
        {viewModel.displayCount}
      </p>
      {viewModel.loading ? (
        <p data-testid='saved-tabs-page-loading'>loading</p>
      ) : null}
      {viewModel.error ? (
        <p data-testid='saved-tabs-page-error'>{viewModel.error}</p>
      ) : null}
      <button
        type='button'
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          void refresh()
        }}
      >
        refresh
      </button>
    </div>
  )
}

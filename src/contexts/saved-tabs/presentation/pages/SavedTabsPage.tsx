import { useEffect, useMemo, useRef, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import { SavedTabsPresentationLayout } from '@/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout'
import {
  LEFT_PANE_COMPACT_BREAKPOINT_PX,
  useSavedTabsLeftPaneWidth,
} from '@/contexts/saved-tabs/presentation/components/savedTabsPresentationLayout.helpers'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useSavedTabsController } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { UseSavedTabsControllerReturn } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/types/ResolveActiveRef'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { SavedTabsViewModel } from '@/contexts/saved-tabs/presentation/view-models/SavedTabsViewModel'
import { getSavedTabsModeFromLocation } from '@/features/navigation/lib/pageNavigation'

export type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/types/ResolveActiveRef'

/**
 * `SavedTabsPage` の props。
 *
 * - `deps` / `useCases` を渡すと composition 済みの use-case が使える。
 *   chrome 実環境で deps を組み立てるには
 *   `createSavedTabsUseCasesDeps()`（`@/app/composition`）を、context 値
 *   への変換は `createSavedTabsUseCasesContextValueFromDeps` を使う。
 * - `initialTabGroups` / `initialCustomProjects` は SSR / Storybook 用に
 *   事前データを渡す補助。テストで repository を差し替えずに view-model を
 *   検証したいときに使う。
 * - `initialViewMode` / `onViewModeNavigate` は
 *   `SavedTabsPresentationLayout` (と内部の `SavedTabsApp`) へ
 *   直接渡すための props。`search` 経由で URL から解決する場合は
 *   呼び出し側で `getSavedTabsModeFromLocation` を使って渡す。
 * - `search` を渡すと `initialViewMode` より優先して URL の mode クエリ
 *   を読む。`SavedTabsRoute` からの呼び出し時は `search` を渡す。
 */
export type SavedTabsPageProps = {
  readonly deps: SavedTabsPresentationPorts
  readonly initialCustomProjects?: readonly CustomProject[]
  readonly initialTabGroups?: readonly TabGroup[]
  readonly initialViewMode?: ViewMode
  readonly onViewModeNavigate?: (mode: ViewMode) => void
  readonly resolveActiveRef?: ResolveActiveRef
  readonly search?: string
  readonly useCases: SavedTabsUseCases
}

/**
 * `resolveActive` を presentation 層 (SavedTabsApp) 側から差し込むための
 * 橋渡し ref。
 *
 * 以下のフローで settings → port まで動的に反映する:
 * 1. `SavedTabsPage` が `useRef` を作る
 * 2. `BrowserTabPort` 構築時に `resolveActive: () => ref.current()` を渡す
 * 3. 同じ ref を layout / app へ下す
 * 4. `SavedTabsApp` 側の `useEffect` で `ref.current` を
 *    `() => !settingsRef.current.openUrlInBackground` に更新する
 * 5. ポートが `open()` 呼び出し時に `resolveActive()` を評価し、最新値を読む
 *
 * ref を介すことで use-case 自体は mount 時に 1 度だけ組み立てればよく、
 * 設定変更のたびに use-case / port を作り直す必要がない。
 */
/**
 * `SavedTabsPage` 内部の controller 状態。
 *
 * ページ → controller フック → use-case → repository / port の流れを
 * 一度だけ確立し、その戻り値を layout へ流す。
 */
export type SavedTabsPageState = {
  readonly viewModel: SavedTabsViewModel
  readonly refresh: () => Promise<void>
  readonly controller: UseSavedTabsControllerReturn
  readonly deps: SavedTabsPresentationPorts
  readonly useCases: SavedTabsUseCases
  readonly resolveActiveRef: ResolveActiveRef
}

/**
 * `SavedTabsPage` のロジック hook。
 *
 * `SavedTabsPage` コンポーネントから分離してテスト可能にしている。
 * コンポーネント側は view-model と controller を layout へ流すだけ。
 */
const useSavedTabsPage = (input: SavedTabsPageProps): SavedTabsPageState => {
  const { deps: inputDeps, useCases: inputUseCases } = input
  // 初期値は `() => true` (active 固定)。`SavedTabsApp` 側の
  // useEffect が settings を読んで本関数を上書きする。
  const fallbackResolveActiveRef = useRef<() => boolean>(() => true)
  const resolveActiveRef = input.resolveActiveRef ?? fallbackResolveActiveRef
  const contextValue = useMemo(
    () => ({ deps: inputDeps, useCases: inputUseCases }),
    [inputDeps, inputUseCases],
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
    // 初回 mount 時に 1 回だけ走ればよいため、
    // ここでは依存配列を空にして再実行を抑止する。
  }, [])
  return {
    controller,
    deps: contextValue.deps,
    refresh: controller.refresh,
    resolveActiveRef,
    useCases: contextValue.useCases,
    viewModel: controller.viewModel,
  }
}

/**
 * `SavedTabsPage` コンポーネント。
 *
 * presentation 層 page の shell。`useSavedTabsPage` で controller を
 * 確立し、URL から導出した `initialViewMode` と一緒に
 * `SavedTabsPresentationLayout` へ流す。
 *
 * UI 構造は旧 `features/saved-tabs/routes/SavedTabsRoute` と等価
 * (左右 split / 左ペイン scroll container / スクロールコントロール /
 * AI チャットウィジェット) で、見た目・操作感は変えない。
 */
export const SavedTabsPage = (props: SavedTabsPageProps) => {
  const { viewModel, refresh, controller, deps, useCases, resolveActiveRef } =
    useSavedTabsPage(props)
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const { attachLeftPaneRef, leftPaneRef, leftPaneWidth } =
    useSavedTabsLeftPaneWidth()
  const isCompactLeftPaneLayout =
    leftPaneWidth < LEFT_PANE_COMPACT_BREAKPOINT_PX
  const resolvedInitialViewMode: ViewMode =
    props.initialViewMode ??
    getSavedTabsModeFromLocation(
      props.search ??
        (typeof window !== 'undefined' ? window.location.search : ''),
    )
  // `useSavedTabsUseCases()` が `null` を返すと子コンポーネントが
  // `StorageChangePort` などの port を取り出せず、開いたモーダルが
  // storage 変更に追従できなくなる。`SavedTabsPage` 配下の
  // presentation ツリー全体に deps / useCases を配布するため
  // `SavedTabsUseCasesProvider` で wrap する。
  // provider value は useMemo で同一参照を保ち、子の不要な
  // 再レンダーを抑える。
  const providerValue = useMemo(() => ({ deps, useCases }), [deps, useCases])

  // view-model の refresh は layout の close 動線 (AI チャットなど) では
  // 直接呼ばないが、controller 側で `refresh` を提供していることを
  // 利用側へ示すために保持する。
  void refresh
  return (
    <SavedTabsUseCasesProvider value={providerValue}>
      <div
        data-testid='saved-tabs-page-presentation'
        data-loading={viewModel.loading ? 'true' : 'false'}
        data-error={viewModel.error ?? ''}
        data-has-content={viewModel.hasContent ? 'true' : 'false'}
      >
        <SavedTabsPresentationLayout
          attachLeftPaneRef={attachLeftPaneRef}
          controller={controller}
          deps={deps}
          initialViewMode={resolvedInitialViewMode}
          isAiSidebarOpen={isAiSidebarOpen}
          isCompactLeftPaneLayout={isCompactLeftPaneLayout}
          leftPaneRef={leftPaneRef}
          onAiSidebarOpenChange={setIsAiSidebarOpen}
          onViewModeNavigate={props.onViewModeNavigate}
          resolveActiveRef={resolveActiveRef}
          useCases={useCases}
        />
      </div>
    </SavedTabsUseCasesProvider>
  )
}

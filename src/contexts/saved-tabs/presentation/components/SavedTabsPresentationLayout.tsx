import { Profiler } from 'react'
import type { RefObject } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { SavedTabsApp } from '@/contexts/saved-tabs/presentation/app/SavedTabsApp'
import {
  handleSavedTabsRender,
  isDevProfileEnabled,
} from '@/contexts/saved-tabs/presentation/app/savedTabsProfiler'
import type { UseSavedTabsControllerReturn } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { ViewMode } from '@/types/storage'

import type { ResolveActiveRef } from '../types/ResolveActiveRef'
import { SavedTabsChatWidgetBridge } from './SavedTabsChatWidgetBridge'
import { SavedTabsResponsiveLayoutProvider } from './SavedTabsResponsiveLayoutContext'
import { SavedTabsScrollControls } from './SavedTabsScrollControls'

/**
 * `SavedTabsPresentationLayout` の props。
 *
 * `SavedTabsPage` 側で導出した page-level state
 * (左ペイン ref attachment / AI サイドバー状態 / view mode / compact 判定)
 * を受け取り、左ペインの実描画 + 右ペインの scroll controls / chat widget
 * まで含めた outer split layout を組み立てる。
 *
 * - `attachLeftPaneRef` : 左ペイン div へ貼る ref callback。page 側で
 *   ResizeObserver 制御に使う
 * - `leftPaneRef` : scroll controls が参照する左ペインスクロールコンテナ
 * - `isCompactLeftPaneLayout` : compact モード時は左右 split を縦並びに切替
 * - `isAiSidebarOpen` : chat widget の表示 / ヘッダー幅制御の判断
 * - `initialViewMode` : SavedTabsApp と scroll controls の mode 初期値
 * - `onAiSidebarOpenChange` : chat widget の開閉が変わった際の
 *   親 (SavedTabsPage) への通知
 * - `onViewModeNavigate` : view mode 切替時に親 (AppRouter) へ通知
 * - `controller` / `useCases` / `deps` / `resolveActiveRef` :
 *   composition root である `SavedTabsPage` 側で組み立てた
 *   use-case バンドルと controller。`SavedTabsApp` 内部での
 *   use-case 再生成を避けるため props 注入する。
 */
export interface SavedTabsPresentationLayoutProps {
  readonly attachLeftPaneRef: (node: HTMLDivElement | null) => void
  readonly controller: UseSavedTabsControllerReturn
  readonly deps: SavedTabsUseCasesDeps
  readonly initialViewMode: ViewMode
  readonly isAiSidebarOpen: boolean
  readonly isCompactLeftPaneLayout: boolean
  readonly leftPaneRef: RefObject<HTMLDivElement | null>
  readonly onAiSidebarOpenChange: (isOpen: boolean) => void
  readonly onViewModeNavigate?: (mode: ViewMode) => void
  readonly resolveActiveRef: ResolveActiveRef
  readonly useCases: SavedTabsUseCases
}

/**
 * contexts/presentation 側の saved-tabs split layout。
 *
 * 旧 `features/saved-tabs/routes/SavedTabsRoute` が
 * `SavedTabsApp` / `SavedTabsResponsiveLayoutProvider` /
 * `SavedTabsScrollControls` / `LazySavedTabsChatWidget` を直接結線
 * していた構造を、contexts 配下の bridge コンポーネント経由で
 * 組み立てる。`SavedTabsApp` 本体は features 側の実装を共有する
 * ため残しつつ、presentation の責務 (左右 split, AI sidebar 状態,
 * dev 専用 Profiler, responsive layout provider) は
 * contexts 側に集約する。
 */
export const SavedTabsPresentationLayout = ({
  attachLeftPaneRef,
  controller,
  deps,
  initialViewMode,
  isAiSidebarOpen,
  isCompactLeftPaneLayout,
  leftPaneRef,
  onAiSidebarOpenChange,
  onViewModeNavigate,
  resolveActiveRef,
  useCases,
}: SavedTabsPresentationLayoutProps) => {
  const savedTabsAppNode = (
    <SavedTabsApp
      controller={controller}
      deps={deps}
      initialViewMode={initialViewMode}
      isAiSidebarOpen={isAiSidebarOpen}
      onViewModeNavigate={onViewModeNavigate}
      resolveActiveRef={resolveActiveRef}
      useCases={useCases}
    />
  )

  return (
    <div
      className='flex h-screen items-stretch overflow-hidden'
      data-testid='saved-tabs-page-layout'
    >
      <div className='flex min-w-0 flex-1'>
        <div
          ref={attachLeftPaneRef}
          className='h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain'
          data-saved-tabs-layout={isCompactLeftPaneLayout ? 'compact' : 'full'}
          data-testid='saved-tabs-left-pane'
        >
          <SavedTabsResponsiveLayoutProvider
            isCompactLayout={isCompactLeftPaneLayout}
          >
            {isDevProfileEnabled ? (
              <Profiler id='SavedTabs' onRender={handleSavedTabsRender}>
                {savedTabsAppNode}
              </Profiler>
            ) : (
              savedTabsAppNode
            )}
          </SavedTabsResponsiveLayoutProvider>
        </div>
        <SavedTabsScrollControls
          scrollContainerRef={leftPaneRef}
          viewMode={initialViewMode}
        />
      </div>
      <SavedTabsChatWidgetBridge onOpenChange={onAiSidebarOpenChange} />
    </div>
  )
}

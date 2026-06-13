import { Profiler } from 'react'
import type { RefObject } from 'react'

import { SavedTabsApp } from '@/features/saved-tabs/app/SavedTabsApp'
import {
  handleSavedTabsRender,
  isDevProfileEnabled,
} from '@/features/saved-tabs/app/savedTabsProfiler'
import type { ViewMode } from '@/types/storage'

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
 */
export interface SavedTabsPresentationLayoutProps {
  readonly attachLeftPaneRef: (node: HTMLDivElement | null) => void
  readonly initialViewMode: ViewMode
  readonly isAiSidebarOpen: boolean
  readonly isCompactLeftPaneLayout: boolean
  readonly leftPaneRef: RefObject<HTMLDivElement | null>
  readonly onAiSidebarOpenChange: (isOpen: boolean) => void
  readonly onViewModeNavigate?: (mode: ViewMode) => void
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
  initialViewMode,
  isAiSidebarOpen,
  isCompactLeftPaneLayout,
  leftPaneRef,
  onAiSidebarOpenChange,
  onViewModeNavigate,
}: SavedTabsPresentationLayoutProps) => {
  const savedTabsAppNode = (
    <SavedTabsApp
      initialViewMode={initialViewMode}
      isAiSidebarOpen={isAiSidebarOpen}
      onViewModeNavigate={onViewModeNavigate}
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

import { createContext, use, useMemo } from 'react'
import type { PropsWithChildren } from 'react'

/**
 * `SavedTabsResponsiveLayoutContext` の value shape。
 *
 * `isCompactLayout` は左ペインの実幅から導出した compact / full 判定。
 * 配下の component は compact モード時のみ別レイアウトへ切り替えるなどの
 * responsive 制御に利用する。
 */
export interface SavedTabsResponsiveLayoutContextValue {
  isCompactLayout: boolean
}

const SavedTabsResponsiveLayoutContext =
  createContext<SavedTabsResponsiveLayoutContextValue>({
    isCompactLayout: false,
  })

interface SavedTabsResponsiveLayoutProviderProps extends PropsWithChildren {
  isCompactLayout: boolean
}

/**
 * saved-tabs 左ペインの compact / full 状態を配下に配布する Provider。
 *
 * contexts/presentation/components 配下へ port した版。旧
 * `features/saved-tabs/contexts/SavedTabsResponsiveLayoutContext` の
 * 役割を引き継ぎ、`SavedTabsRoute` 側の ResizeObserver 計算結果と
 * `SavedTabsPresentationLayout` 配下の component をつなぐ役を担う。
 */
export const SavedTabsResponsiveLayoutProvider = ({
  isCompactLayout,
  children,
}: SavedTabsResponsiveLayoutProviderProps) => {
  const value = useMemo(() => ({ isCompactLayout }), [isCompactLayout])

  return (
    <SavedTabsResponsiveLayoutContext.Provider value={value}>
      {children}
    </SavedTabsResponsiveLayoutContext.Provider>
  )
}

/**
 * saved-tabs 左ペインの compact / full 状態を取り出す hook。
 *
 * Provider 外で呼ばれた場合は `isCompactLayout: false` を返す。
 */
export const useSavedTabsResponsiveLayout = () =>
  use(SavedTabsResponsiveLayoutContext)

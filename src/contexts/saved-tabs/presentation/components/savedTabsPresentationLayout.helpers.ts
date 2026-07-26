import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

const LEFT_PANE_COMPACT_BREAKPOINT = 1024

const getViewportWidthSnapshot = (): number => window.innerWidth

const getElementWidthSnapshot = (element: HTMLDivElement | null): number => {
  if (!element) {
    return getViewportWidthSnapshot()
  }

  const width = Math.round(element.getBoundingClientRect().width)
  if (!Number.isFinite(width) || width <= 0) {
    return getViewportWidthSnapshot()
  }

  return width
}

const getLeftPaneWidthStoreSnapshot = (width: number | null): number =>
  width ?? getViewportWidthSnapshot()

const subscribeToElementWidth = (
  element: HTMLDivElement | null,
  widthRef: { current: number | null },
  onStoreChange: () => void,
): (() => void) => {
  if (!element) {
    return () => {}
  }

  if (typeof ResizeObserver === 'undefined') {
    const handleResize = () => {
      widthRef.current = getElementWidthSnapshot(element)
      onStoreChange()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }

  const observer = new ResizeObserver((entries) => {
    const nextWidth = entries[0]?.contentRect.width
    const width = Math.round(nextWidth)
    if (Number.isFinite(width) && width > 0) {
      widthRef.current = width
    }
    onStoreChange()
  })
  observer.observe(element)

  return () => {
    observer.disconnect()
  }
}

/**
 * saved-tabs 左ペインの実幅を ResizeObserver (なければ resize event) で
 * 追従し、現在の幅と ref を取り出す hook。
 *
 * 旧 `features/saved-tabs/routes/SavedTabsRoute` の
 * `useLeftPaneWidth` を contexts 側へ port した版。
 * 返り値の `attachLeftPaneRef` を `SavedTabsPresentationLayout` の
 * 左ペイン div へ渡し、`leftPaneWidth` を compact 判定と
 * `data-saved-tabs-layout` 属性の制御に利用する。
 */
export const useSavedTabsLeftPaneWidth = (): {
  attachLeftPaneRef: (node: HTMLDivElement | null) => void
  leftPaneRef: RefObject<HTMLDivElement | null>
  leftPaneWidth: number
} => {
  const leftPaneRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef<number | null>(null)
  // widthRef.current === null can't use ??: intentional identity check
  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- intentional === null check
  if (widthRef.current === null) {
    widthRef.current = getViewportWidthSnapshot()
  }
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const attachLeftPaneRef = useCallback((node: HTMLDivElement | null) => {
    leftPaneRef.current = node
    widthRef.current = getElementWidthSnapshot(node)
    setElement(node)
  }, [])
  const leftPaneWidth = useSyncExternalStore(
    (onStoreChange) =>
      subscribeToElementWidth(element, widthRef, onStoreChange),
    () => getLeftPaneWidthStoreSnapshot(widthRef.current),
    getViewportWidthSnapshot,
  )

  return {
    attachLeftPaneRef,
    leftPaneRef,
    leftPaneWidth,
  }
}

/**
 * 左ペイン compact 判定の閾値。
 * 旧 route と同じ 1024px を採用し、view mode / 横スクロール挙動の差分を
 * 移植先で再現できる粒度で公開する。
 */
export const LEFT_PANE_COMPACT_BREAKPOINT_PX = LEFT_PANE_COMPACT_BREAKPOINT

export { getLeftPaneWidthStoreSnapshot }

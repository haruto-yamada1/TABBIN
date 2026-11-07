import { useCallback, useSyncExternalStore, useRef } from 'react'

import { useSavedTabsUseCases } from './SavedTabsUseCasesContext'

const noop = () => {}
const EMPTY_OPEN_URLS: readonly string[] = []

/**
 * 監視中の「開いている URL」全件をスカラーとして購読する hook。
 *
 * `openSavedTabsPort` が未提供 (Provider 外 / practice) の場合は空配列の
 * 安定参照を返す。`useSyncExternalStore` の getSnapshot は同一内容でも
 * 新しい配列参照を返すと無限再描画になるため、差分 (同じ長さ & 全要素一致)
 * の間は前回の参照を返してキャッシュする。
 * `enabled=false` の間は snapshot の読み取りと購読を両方停止する。
 */
export const useOpenSavedUrls = (enabled = true): readonly string[] => {
  const port = useSavedTabsUseCases()?.deps.openSavedTabsPort
  const cachedRef = useRef<readonly string[]>(EMPTY_OPEN_URLS)
  const subscribe = useCallback(
    (listener: () => void) =>
      enabled ? (port?.subscribeOpenUrls(listener) ?? noop) : noop,
    [enabled, port],
  )
  const getSnapshot = useCallback(() => {
    if (!enabled) {
      return EMPTY_OPEN_URLS
    }
    const next = port?.getOpenUrlsSnapshot() ?? EMPTY_OPEN_URLS
    const cached = cachedRef.current
    if (next.length !== cached.length) {
      cachedRef.current = next
      return next
    }
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] !== cached[index]) {
        cachedRef.current = next
        return next
      }
    }
    return cached
  }, [enabled, port])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

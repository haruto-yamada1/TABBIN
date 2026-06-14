/**
 * `chrome.storage.onChanged` 依存を `StorageChangePort` interface に
 * 適合させる adapter。
 *
 * `presentation` 層は `chrome.storage.onChanged` を直接購読できないため、
 * `composition` 層からこの adapter を `StorageChangePort` として
 * 注入する。`chrome` API が見つからない環境（テスト / Storybook /
 * SSR など）では `subscribe` の返り値を呼んでも何もしない
 * no-op 関数として扱い、use-case / presentation 側の後段処理を
 * 落とさない方針とする（`chrome.tabs` 等の他 adapter とは挙動が
 * 異なる点に注意）。
 *
 * port 境界では `chrome.storage.StorageChange` を `{ key, oldValue,
 * newValue }` の DTO に詰め替え、port 利用側に `chrome.*` 型を
 * 一切露出しない。storage エリア名 (`local` / `sync` 等) は
 * `options.areaName` で絞り込み、saved-tabs は `local` のみを
 * 対象とする既定とする。
 *
 * @example
 * ```ts
 * const port: StorageChangePort = createChromeStorageChangeAdapter()
 * const unsubscribe = port.subscribe((changes) => {
 *   // changes は port DTO の配列
 * })
 * // unmount 時に呼ぶ
 * unsubscribe()
 * ```
 */

import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'

import { CHROME_STORAGE_CHANGE_ADAPTER_MARKER } from '../../application/ports/StorageChangePort'
import type {
  SavedTabsStorageChange,
  SavedTabsStorageChangeKey,
  StorageChangePort,
} from '../../application/ports/StorageChangePort'

export interface ChromeStorageOnChangedLike {
  readonly addListener: (callback: ChromeOnChangedListener) => void
  readonly removeListener: (callback: ChromeOnChangedListener) => void
}

export interface ChromeStorageLike {
  readonly onChanged?: ChromeStorageOnChangedLike
}

export interface ChromeApiLike {
  readonly storage?: ChromeStorageLike
}

type ChromeOnChangedListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

export interface ChromeStorageChangeAdapterDeps {
  /**
   * `chrome.storage.onChanged` を含む chrome API 全体。テスト時は
   * `storage.onChanged.addListener` / `removeListener` を持つ
   * モックオブジェクトを渡す。未指定なら `getChromeStorageOnChanged`
   * 経由で実 `chrome` グローバルを参照する。
   */
  readonly getApi?: () => ChromeApiLike | undefined
  /**
   * `chrome.storage.onChanged` 相当の API を直接注入したい場合用。
   * `getApi` より優先される（Storybook などで `chrome` の一部だけを
   * 差し込みたい場合を想定）。
   */
  readonly getOnChanged?: () => ChromeStorageOnChangedLike | null
}

export interface ChromeStorageChangeAdapterOptions {
  /**
   * 購読対象とする storage エリア名。`chrome.storage.onChanged` は
   * グローバルに発火するため、port 側で areaName を絞り込む。
   * saved-tabs は `local` のみを使う前提でデフォルト 'local'。
   * `chrome.storage.sync` を併用する extension では `'sync'` を渡す。
   */
  readonly areaName?: 'local' | 'sync' | 'managed' | 'session'
}

const isSavedTabsStorageChangeKey = (
  key: string,
): key is SavedTabsStorageChangeKey => {
  return (
    key === 'savedTabs' ||
    key === 'urls' ||
    key === 'parentCategories' ||
    key === 'customProjects' ||
    key === 'customProjectOrder' ||
    key === 'userSettings'
  )
}

/**
 * `chrome.storage.onChanged` を利用する `StorageChangePort` 実装を生成する。
 *
 * `chrome` API が見つからない環境（テスト / Storybook など）では
 * `subscribe` の戻り値が no-op となり、listener は発火しない。
 * これは「storage 変更を契機とする UI 同期は止めても use-case 全体は
 * 落とさない」という presentation 側の運用のため。
 * もし失敗を可視化したい場合は port 実装をモックで差し替え、
 * テスト時に listener 呼び出しを検証する。
 */
export const createChromeStorageChangeAdapter = (
  deps: ChromeStorageChangeAdapterDeps = {},
  options: ChromeStorageChangeAdapterOptions = {},
): StorageChangePort => {
  const areaName = options.areaName ?? 'local'

  const resolveOnChanged = (): ChromeStorageOnChangedLike | null => {
    if (deps.getOnChanged) {
      return deps.getOnChanged()
    }
    if (deps.getApi) {
      return deps.getApi()?.storage?.onChanged ?? null
    }
    return getChromeStorageOnChanged() as ChromeStorageOnChangedLike | null
  }

  return {
    [CHROME_STORAGE_CHANGE_ADAPTER_MARKER]: true,
    subscribe: (listener) => {
      const onChanged = resolveOnChanged()
      if (!onChanged) {
        return () => {}
      }
      const wrappedListener: ChromeOnChangedListener = (changes, area) => {
        if (area !== areaName) {
          return
        }
        const events: SavedTabsStorageChange[] = []
        for (const [key, change] of Object.entries(changes)) {
          if (!isSavedTabsStorageChangeKey(key)) {
            continue
          }
          events.push({
            key,
            oldValue: change.oldValue,
            newValue: change.newValue,
          })
        }
        listener(events)
      }
      onChanged.addListener(wrappedListener)
      return () => {
        onChanged.removeListener(wrappedListener)
      }
    },
  }
}

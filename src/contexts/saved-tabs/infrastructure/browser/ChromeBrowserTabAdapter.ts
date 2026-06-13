/**
 * `chrome.tabs` 依存を `BrowserTabPort` interface に適合させる adapter。
 *
 * `presentation` 層は `chrome.tabs` を直接参照できないため、
 * `composition` 層からこの adapter を `BrowserTabPort` として use-case へ注入する。
 *
 * `active` / `url` のみを port の最小 interface として公開し、それ以外の
 * 拡張機能固有のフィールドは port 仕様変更まで持ち込まない。
 *
 * @example
 * ```ts
 * const port: BrowserTabPort = createChromeBrowserTabAdapter({
 *   getApi: () => chrome,
 * })
 * await port.open({ url: 'https://example.com' })
 * ```
 */

export interface ChromeBrowserTabAdapterDeps {
  /**
   * `chrome.tabs` を提供する chrome API 全体。テスト時は
   * `chrome.tabs.create` を持つモックオブジェクトを渡す。
   */
  readonly getApi: () => ChromeApiLike | undefined
}

export interface ChromeApiLike {
  readonly tabs?: ChromeTabsLike
}

export interface ChromeTabsLike {
  readonly create?: (createProperties: {
    readonly active?: boolean
    readonly url: string
  }) => Promise<{ readonly url?: string } | undefined> | undefined
}

interface ChromeBrowserTabAdapterOptions {
  /**
   * 新規タブをアクティブ（前面）にするかを port 利用側（open saved url use-case）が
   * 決められるよう、`active` を返す関数を委譲できる。
   * 未指定なら `active: true` で開く。
   */
  readonly resolveActive?: () => boolean
}

/**
 * `chrome.tabs.create` を利用する `BrowserTabPort` 実装を生成する。
 *
 * `chrome` API が見つからない環境（テスト / SSR など）では
 * 即座に `Error` を投げ、use-case 側で失敗を通知する。
 * 「サイレントに何もしない」よりも、副作用が必要な操作は
 * 失敗を可視化することが重要という DDD の方針に従う。
 */
export const createChromeBrowserTabAdapter = (
  deps: ChromeBrowserTabAdapterDeps,
  options: ChromeBrowserTabAdapterOptions = {},
) => {
  return {
    open: async (input: { readonly url: string }) => {
      const api = deps.getApi()
      const tabs = api?.tabs
      const active = options.resolveActive?.() ?? true
      if (!tabs?.create) {
        throw new Error('chrome.tabs.create is not available')
      }
      const result = await tabs.create({ active, url: input.url })
      return { url: result?.url ?? input.url }
    },
  }
}

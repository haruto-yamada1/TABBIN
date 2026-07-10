/**
 * `chrome.windows` 依存を `BrowserWindowPort` interface に適合させる adapter。
 *
 * `presentation` 層は `chrome.windows` を直接参照できないため、
 * `composition` 層からこの adapter を `BrowserWindowPort` として use-case へ注入する。
 *
 * `openWithUrls` は引数の URL 配列をそのまま `chrome.windows.create` に渡し、
 * 開いた URL 配列を返す。`focused` は省略時 `true`（前面表示）として扱う。
 *
 * @example
 * ```ts
 * const port: BrowserWindowPort = createChromeBrowserWindowAdapter({
 *   getApi: () => chrome,
 * })
 * await port.openWithUrls({ urls: ['https://example.com'] })
 * ```
 */

export type ChromeBrowserWindowAdapterDeps = {
  /**
   * `chrome.windows` を提供する chrome API 全体。テスト時は
   * `chrome.windows.create` を持つモックオブジェクトを渡す。
   */
  readonly getApi: () => ChromeWindowsApiLike | undefined
}

export type ChromeWindowsApiLike = {
  readonly windows?: ChromeWindowsLike
}

export type ChromeWindowsLike = {
  readonly create?: (createProperties: {
    readonly focused?: boolean
    readonly url?: readonly string[] | string
  }) =>
    | Promise<
        { readonly tabs?: readonly { readonly url?: string }[] } | undefined
      >
    | undefined
}

export type ChromeBrowserWindowAdapterOptions = {
  /**
   * 新規ウィンドウを前面に表示するかを port 利用側（open all saved urls use-case）が
   * 決められるよう、`focused` の既定値を委譲できる。
   * 未指定なら `focused: true` で開く。
   */
  readonly resolveFocused?: () => boolean
}

/**
 * `chrome.windows.create` を利用する `BrowserWindowPort` 実装を生成する。
 *
 * `chrome` API が見つからない環境（テスト / SSR など）では
 * 即座に `Error` を投げ、use-case 側で失敗を通知する。
 * 「サイレントに何もしない」よりも、副作用が必要な操作は
 * 失敗を可視化することが重要という DDD の方針に従う。
 */
export const createChromeBrowserWindowAdapter = (
  deps: ChromeBrowserWindowAdapterDeps,
  options: ChromeBrowserWindowAdapterOptions = {},
) => {
  return {
    openWithUrls: async (input: {
      readonly urls: readonly string[]
      readonly focused?: boolean
    }) => {
      const api = deps.getApi()
      const windows = api?.windows
      const focused = input.focused ?? options.resolveFocused?.() ?? true
      if (!windows?.create) {
        throw new Error('chrome.windows.create is not available')
      }
      const result = await windows.create({
        focused,
        url: [...input.urls],
      })
      const openedUrls = (result?.tabs ?? [])
        .map((tab) => tab.url)
        .filter((url): url is string => typeof url === 'string')
      // `chrome.windows.create` が URL 情報を返さない（あるいは一部しか返さない）
      // 環境へのフォールバックとして、入力された URL 配列をそのまま返す。
      return {
        urls: openedUrls.length > 0 ? openedUrls : [...input.urls],
      }
    },
  }
}

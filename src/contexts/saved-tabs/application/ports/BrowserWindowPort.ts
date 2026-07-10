/**
 * `chrome.windows.create` 相当の操作を抽象化する port。
 *
 * application 層は `chrome.*` API を直接呼ばず、本 port 経由で
 * 「複数 URL を新規ウィンドウでまとめて開く」操作を依頼する。
 * infrastructure 層が `ChromeBrowserWindowAdapter` などで
 * 本 port を実装し、composition 層で use-case へ注入する。
 *
 * 返り値は開いた URL 配列だけを返し、ウィンドウ ID などの詳細には
 * 依存しない。Undo 用スナップショットや presentation 側の表示更新は
 * URL 文字列だけで十分判定できるため、port の最小 interface を保つ。
 *
 * @example
 * ```ts
 * const port: BrowserWindowPort = createChromeBrowserWindowAdapter()
 * const result = await port.openWithUrls({ urls: ['https://example.com'] })
 * console.log(result.urls)
 * ```
 */
export type BrowserWindowPort = {
  /**
   * 指定 URL 群を 1 つの新規ウィンドウでまとめて開き、
   * 開いた URL 配列を返す。
   *
   * 拡張機能によっては `chrome.windows.create({ url })` のみを
   * サポートするため、本 port も複数 URL を 1 度に開く挙動に
   * 正規化する。呼び出し側は「どのウィンドウが開いたか」の ID を
   * 知る必要がないため、ID を返さない（必要になった時点で port を拡張する）。
   *
   * 失敗時（permission 不足・URL 不正など）は `Error` を投げる。
   * 1 件でも失敗した場合は部分成功とせず、呼び出し側で例外ハンドリング
   * させる方針。
   */
  openWithUrls: (input: {
    readonly urls: readonly string[]
    readonly focused?: boolean
  }) => Promise<{ readonly urls: readonly string[] }>
}

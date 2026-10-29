/**
 * `chrome.windows.create` 相当の操作を抽象化する port。
 *
 * application 層は `chrome.*` API を直接呼ばず、本 port 経由で
 * 「複数 URL を新規ウィンドウでまとめて開く」操作を依頼する。
 * infrastructure 層が `ChromeBrowserWindowAdapter` などで
 * 本 port を実装し、composition 層で use-case へ注入する。
 *
 * 返り値は確認できた URL 配列と、後続タブを同じウィンドウへ追加するための
 * windowId を返す。ID が確認できない場合は後続の追加を行わない。
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
   * 作成結果で確認できた要求 URL の配列を返す（未確認分は含めない）。
   *
   * 拡張機能によっては `chrome.windows.create({ url })` のみを
   * サポートするため、本 port も複数 URL を 1 度に開く挙動に
   * 正規化する。段階実行では windowId で同じウィンドウへ追加する。
   *
   * 失敗時（permission 不足・URL 不正など）は `Error` を投げる。
   * 作成全体の拒否は throw し、部分的な確認は返却 URL の部分集合で表す。
   */
  openWithUrls: (input: {
    readonly urls: readonly string[]
    readonly focused?: boolean
  }) => Promise<{
    readonly urls: readonly string[]
    readonly windowId?: number
  }>
}

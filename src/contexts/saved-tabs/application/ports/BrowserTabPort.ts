/**
 * `chrome.tabs.create` 相当の操作を抽象化する port。
 *
 * application 層は `chrome.*` API を直接呼ばず、本 port 経由で
 * 「URL を開く」操作を依頼する。infrastructure 層が `ChromeBrowserTabAdapter`
 * などで本 port を実装し、composition 層で use-case へ注入する。
 *
 * 返り値は開いたタブ / URL のうち、Undo 用スナップショットや
 * 連鎖削除の判定に必要な最小限のフィールドだけを返す。
 * ドメイン entity は持ち込まない（presentation / domain 双方に依存しないため）。
 *
 * @example
 * ```ts
 * const port: BrowserTabPort = createChromeBrowserTabAdapter()
 * const opened = await port.open({ url: 'https://example.com' })
 * console.log(opened.url)
 * ```
 */
export type BrowserTabPort = {
  /**
   * 指定 URL を新規タブ / 既存タブで開き、開いた URL を返す。
   *
   * 拡張機能によっては `chrome.tabs.create` / `chrome.tabs.update` のいずれかを
   * 使い分けるが、本 port では `url` を受け取り、最終的に開いた URL を返す形
   * に正規化する。呼び出し側は「どのタブが開いたか」の ID を知る必要がない
   * ため、ID を返さない（必要になった時点で port を拡張する）。
   *
   * 失敗時（permission 不足・URL 不正など）は `Error` を投げる。
   */
  open: (input: { url: string }) => Promise<{ readonly url: string }>
}

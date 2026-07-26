/**
 * `OpenAllSavedUrlsUseCase` の入力。
 *
 * 既存の `SavedTabsApp.tsx` の `handleOpenAllTabs` 相当の責務を
 * 1 つの use-case にまとめる。`urls` は開く対象の URL 文字列配列、
 * `mode` で「新規ウィンドウでまとめて開く」「既存タブとして 1 つずつ開く」
 * を使い分ける。
 *
 * `openUrlInBackground` 設定は use-case には渡さず、composition 層が
 * `BrowserTabPort` の `resolveActive` へ反映する形にする
 * （`OpenSavedUrlUseCase` と同じパターン）。
 *
 * `removeTabAfterOpen` が `true` のときは、開いたあとに保存タブ
 * （`TabGroup` / `CustomProject`）から該当 URL を削除する。
 *
 * @example
 * ```ts
 * const command: OpenAllSavedUrlsCommand = {
 *   mode: 'newWindow',
 *   removeTabAfterOpen: false,
 *   urls: ['https://example.com/a', 'https://example.com/b'],
 * }
 * const result = await openAllSavedUrlsUseCase(command)
 * ```
 */
export type OpenAllSavedUrlsMode = 'newWindow' | 'backgroundTabs'

export type OpenAllSavedUrlsCommand = {
  readonly urls: readonly string[]
  readonly mode: OpenAllSavedUrlsMode
  /**
   * 開いたあとに保存タブから削除するかの設定値。
   * presentation 層がユーザーの preferences から取得して注入する。
   */
  readonly removeTabAfterOpen: boolean
}

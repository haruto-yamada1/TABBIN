/**
 * `DeleteSavedUrlsUseCase` の入力。
 *
 * 既存 `SavedTabsApp.tsx` の `handleDeleteUrls` 相当の責務を
 * 1 つの use-case にまとめる。`tabGroupId` で対象 `TabGroup` を特定し、
 * `urls` で削除する URL 文字列配列を指定する。
 *
 * 1 件以上の URL を削除した場合のみ DTO を返す。`urls` が空配列のときは
 * no-op として空の DTO を返す。
 *
 * @example
 * ```ts
 * const command: DeleteSavedUrlsCommand = {
 *   tabGroupId,
 *   urls: ['https://example.com/a', 'https://example.com/b'],
 * }
 * const result = await deleteSavedUrlsUseCase(command)
 * ```
 */
export interface DeleteSavedUrlsCommand {
  readonly tabGroupId: string
  readonly urls: readonly string[]
}

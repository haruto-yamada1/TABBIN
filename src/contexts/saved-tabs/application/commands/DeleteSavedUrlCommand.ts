import type { TabGroupId } from '../../domain/value-objects/TabGroupId'

/**
 * `DeleteSavedUrlUseCase` の入力。
 *
 * 既存 `SavedTabsApp.tsx` の `handleDeleteUrl` 相当の責務を
 * 1 つの use-case にまとめる。`tabGroupId` で対象 `TabGroup` を特定し、
 * `url` で削除する URL 文字列を指定する。
 *
 * URL 文字列 → `UrlRecordId` の逆引きは use-case 内で
 * `UrlRecordRepository.findAll` を通じて行う。`UrlRecord` が
 * 見つからない URL は `SavedTabsDomainError` を投げる。
 *
 * @example
 * ```ts
 * const command: DeleteSavedUrlCommand = {
 *   tabGroupId,
 *   url: 'https://example.com/a',
 * }
 * const result = await deleteSavedUrlUseCase(command)
 * ```
 */
export interface DeleteSavedUrlCommand {
  readonly tabGroupId: TabGroupId
  readonly url: string
}

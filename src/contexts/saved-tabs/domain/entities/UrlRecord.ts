import { SavedTabsDomainError } from '../errors/SavedTabsDomainError'
import { createSavedAt } from '../value-objects/SavedAt'
import type { SavedAt } from '../value-objects/SavedAt'
import { createUrl } from '../value-objects/Url'
import type { Url } from '../value-objects/Url'
import { createUrlRecordId } from '../value-objects/UrlRecordId'
import type { UrlRecordId } from '../value-objects/UrlRecordId'

/**
 * 共通 URL レコードを表すドメインエンティティ。
 *
 * `chrome.storage.local` 上の `urlRecords[]` と 1:1 対応する不変モデル。
 * 複数の `TabGroup` / `CustomProject` から `urlIds` を介して参照される。
 *
 * `title` は空文字列を許容する（ページタイトルが取得できないケースがある）。
 * `favIconUrl` は省略可能。`savedAt` は保存時刻（必須）。
 *
 * @example
 * ```ts
 * const record = createUrlRecord({
 *   id: 'record-1',
 *   url: 'https://example.com',
 *   title: 'Example',
 *   savedAt: 1700000000000,
 * })
 * ```
 */
export interface UrlRecord {
  readonly id: UrlRecordId
  readonly url: Url
  readonly title: string
  readonly savedAt: SavedAt
  readonly favIconUrl?: string
}

interface CreateUrlRecordInput {
  id: string
  url: string
  title: string
  savedAt: number
  favIconUrl?: string
}

/**
 * `UrlRecord` を生成する。
 *
 * 各値オブジェクトのバリデーションを通り抜けた値だけを保持する。
 * `title` は `string` であることだけ確認し、空文字列も許容する。
 */
export const createUrlRecord = (input: CreateUrlRecordInput): UrlRecord => {
  if (typeof input.title !== 'string') {
    throw new SavedTabsDomainError(
      'UrlRecord の title は文字列で指定してください',
      'INVALID_URL_RECORD',
    )
  }
  if (input.favIconUrl !== undefined && typeof input.favIconUrl !== 'string') {
    throw new SavedTabsDomainError(
      'UrlRecord の favIconUrl は文字列で指定してください',
      'INVALID_URL_RECORD',
    )
  }
  return {
    id: createUrlRecordId(input.id),
    url: createUrl(input.url),
    title: input.title,
    savedAt: createSavedAt(input.savedAt),
    favIconUrl: input.favIconUrl,
  }
}

/**
 * 2 つの `UrlRecord` を ID で同一視するかを判定する。
 */
export const isSameUrlRecord = (a: UrlRecord, b: UrlRecord): boolean =>
  a.id === b.id

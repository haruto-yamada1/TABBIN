import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { UrlRecord } from '../../../domain/entities/UrlRecord'
import type { UrlRecordRepository } from '../../../domain/repositories/UrlRecordRepository'
import type { UrlRecordId } from '../../../domain/value-objects/UrlRecordId'
import { ChromeSavedTabsStorageMapper } from '../../mappers/ChromeSavedTabsStorageMapper'
import { URLS_KEY } from './savedTabsStorageKeys'
import type { UrlRecordRaw } from './savedTabsStorageSchema'

/**
 * `chrome.storage.local` のうち `UrlRecord` 永続化に必要な操作だけを抜き出した port。
 *
 * 実 API の `chrome.storage.local.get` は `Promise<Record<string, unknown>>` を
 * 返し、`set` / `remove` は `Promise<void>` を返す。テストでは in-memory モック
 * を注入できるよう、`get(key)` の戻り値型を `Record<string, unknown>` に統一している。
 */
export interface ChromeStorageLocalPort {
  get: (key: string) => Promise<Record<string, unknown>>
  remove: (key: string) => Promise<void>
  set: (value: Record<string, unknown>) => Promise<void>
}

/**
 * `chrome.storage.local` が利用できない環境で repository を初期化した際に投げる。
 *
 * domain 層の `SavedTabsDomainError` に混ぜると chrome 依存の事情が domain に
 * 漏れ出すため、infrastructure 層に閉じた通常の `Error` 派生命とする。
 * use-case 層で `instanceof` 判定してフォールバック処理に繋ぐ想定。
 */
export class SavedTabsRepositoryUnavailableError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SavedTabsRepositoryUnavailableError'
  }
}

const getDefaultPort = (): ChromeStorageLocalPort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: (key) => local.get(key),
    remove: (key) => local.remove(key),
    set: (value) => local.set(value),
  }
}

const createChromeUrlRecordRepositoryImpl = (
  port: ChromeStorageLocalPort,
): UrlRecordRepository => {
  const findAll = async (): Promise<readonly UrlRecord[]> => {
    const result = await port.get(URLS_KEY)
    const raw = result[URLS_KEY]
    return ChromeSavedTabsStorageMapper.parseUrlRecords(raw)
  }

  const findById = async (id: UrlRecordId): Promise<UrlRecord | null> => {
    const idString = ChromeSavedTabsStorageMapper.urlRecordIdToString(id)
    const all = await findAll()
    return all.find((record) => record.id === idString) ?? null
  }

  const saveAll = async (records: readonly UrlRecord[]): Promise<void> => {
    const raws: UrlRecordRaw[] = records.map((record) =>
      ChromeSavedTabsStorageMapper.toUrlRecordRaw(record),
    )
    await port.set({ [URLS_KEY]: raws })
  }

  const removeByIds = async (ids: readonly UrlRecordId[]): Promise<void> => {
    if (ids.length === 0) {
      return
    }
    const idSet = new Set(ids.map((id) => id))
    const all = await findAll()
    const remaining = all.filter((record) => !idSet.has(record.id))
    if (remaining.length === all.length) {
      return
    }
    await saveAll(remaining)
  }

  return { findAll, findById, removeByIds, saveAll }
}

/**
 * `chrome.storage.local` 上の `URLS_KEY` を `UrlRecord` 永続化用に使う
 * `UrlRecordRepository` 実装を生成する。
 *
 * `port` を渡さない場合は production と同じ `chrome.storage.local` を使う。
 * `chrome.storage.local` が利用できない場合、初回呼び出し時に
 * `SavedTabsRepositoryUnavailableError` を投げる（lazy 検出）。
 *
 * 例外: 旧 `src/lib/storage/urls.ts` のインメモリキャッシュは意図的に
 * 再現していない。`findAll` を何度呼んでも `chrome.storage.local.get` を
 * 経由する。use-case 側で読み取り回数を抑えてほしい。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeUrlRecordRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): UrlRecordRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeUrlRecordRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeUrlRecordRepository を初期化できません',
    )
  }
  return createChromeUrlRecordRepositoryImpl(port)
}

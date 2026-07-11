import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'

type ChromeStorageApi = typeof chrome.storage

/**
 * `chrome.storage.onChanged` listener に渡される変更エントリ。
 * `chrome.storage.StorageChange` 互換だが、`chrome.*` 型を利用側に
 * 露出しないための infrastructure 側の型境界。
 */
export type StorageChange = {
  newValue?: unknown
  oldValue?: unknown
}

export type ChromeOnChangedListener = (
  changes: Record<string, StorageChange>,
  areaName: string,
) => void

const warnedContexts = new Set<string>()

const isChromeApi = (value: unknown): value is typeof chrome =>
  isObjectLike(value) && isObjectLike(Reflect.get(value, 'storage'))

const getChromeApi = (): typeof chrome | undefined =>
  getChromeGlobal(isChromeApi)

export const getChromeStorage = (): ChromeStorageApi | null =>
  getChromeApi()?.storage ?? null

export const getChromeStorageLocal = (): typeof chrome.storage.local | null =>
  getChromeStorage()?.local ?? null

export const getChromeStorageOnChanged = ():
  | typeof chrome.storage.onChanged
  | null => getChromeStorage()?.onChanged ?? null

export const warnMissingChromeStorage = (context: string) => {
  if (warnedContexts.has(context)) {
    return
  }
  warnedContexts.add(context)
  console.warn(
    `chrome.storage APIが利用できないため ${context} はフォールバック動作になります`,
  )
}

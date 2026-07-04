import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'

type ChromeStorageApi = typeof chrome.storage

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

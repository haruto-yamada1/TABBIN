import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'

import type { ChromeApiLike } from './ChromeBrowserTabAdapter'
import type { ChromeWindowsApiLike } from './ChromeBrowserWindowAdapter'

type BrowserCreationApi = ChromeApiLike & ChromeWindowsApiLike

const isBrowserCreationApi = (value: unknown): value is BrowserCreationApi =>
  isObjectLike(value)

/** Firefox's browser namespace supplies Promise completion; chrome uses callbacks. */
export const getBrowserCreationApi = (): BrowserCreationApi | undefined => {
  const browserValue: unknown = Reflect.get(globalThis, 'browser')
  if (browserValue !== undefined) {
    return isBrowserCreationApi(browserValue) ? browserValue : undefined
  }
  // Chrome MV3 natively supports promises. Never retry an invocation via another API.
  return getChromeGlobal(isBrowserCreationApi)
}

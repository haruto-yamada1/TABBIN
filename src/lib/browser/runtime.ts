import { isObjectLike } from './chrome-global'

type BrowserRuntime = {
  connect?: (connectInfo?: { name?: string }) => RuntimePort
  sendMessage?: (message: unknown) => Promise<unknown>
}

type BrowserApi = {
  runtime?: BrowserRuntime
}

type ChromeRuntime = {
  connect?: (connectInfo?: { name?: string }) => RuntimePort
  sendMessage?: (
    message: unknown,
    callback?: (response: unknown) => void,
  ) => void
}

type RuntimePort = {
  disconnect: () => void
  onDisconnect: {
    addListener: (listener: () => void) => void
  }
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void
  }
  postMessage: (message: unknown) => void
}

type BrowserModule = {
  default?: BrowserApi
}

let browserApiPromise: Promise<BrowserApi | null> | null = null

const hasFunctionProperty = (value: object, property: string): boolean =>
  typeof Reflect.get(value, property) === 'function'

const hasAddListener = (value: unknown): boolean =>
  isObjectLike(value) && hasFunctionProperty(value, 'addListener')

const isRuntimePort = (value: unknown): value is RuntimePort =>
  isObjectLike(value) &&
  hasFunctionProperty(value, 'disconnect') &&
  hasAddListener(Reflect.get(value, 'onDisconnect')) &&
  hasAddListener(Reflect.get(value, 'onMessage')) &&
  hasFunctionProperty(value, 'postMessage')

const getGlobalBrowserApi = (): BrowserApi | null => {
  const api: unknown = Reflect.get(globalThis, 'browser')
  return isObjectLike(api) ? api : null
}

const getGlobalChromeRuntime = (): ChromeRuntime | null => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  if (!isObjectLike(chromeValue)) {
    return null
  }
  const runtimeValue: unknown = Reflect.get(chromeValue, 'runtime')
  if (!isObjectLike(runtimeValue)) {
    return null
  }
  const connectValue: unknown = Reflect.get(runtimeValue, 'connect')
  const sendMessageValue: unknown = Reflect.get(runtimeValue, 'sendMessage')
  if (
    (connectValue !== undefined && typeof connectValue !== 'function') ||
    (sendMessageValue !== undefined && typeof sendMessageValue !== 'function')
  ) {
    return null
  }
  return runtimeValue
}

const loadWebExtensionBrowserApi = async (): Promise<BrowserApi | null> => {
  browserApiPromise ??= import('webextension-polyfill').then(
    (mod: BrowserModule) => mod.default ?? null,
  )
  return browserApiPromise
}

const sendWithChromeRuntime = async (
  runtime: ChromeRuntime,
  message: unknown,
): Promise<unknown> =>
  new Promise((resolve) => {
    try {
      runtime.sendMessage?.(message, (response) => {
        resolve(response)
      })
    } catch {
      resolve(undefined)
    }
  })

/**
 * `chrome.runtime.PlatformInfo` 互換の最小型。
 * `chrome.*` 型を利用側に露出しないための infrastructure 側の型境界。
 */
export type PlatformInfo = {
  os?: string
}

/**
 * `chrome.runtime.getManifest().version` を安全に取得する。
 * `chrome` API が見つからない環境では `undefined` を返す。
 */
export const getManifestVersion = (): string | undefined => {
  const chromeRuntime = getGlobalChromeRuntime()
  if (!chromeRuntime) {
    return undefined
  }
  const getManifestValue: unknown = Reflect.get(chromeRuntime, 'getManifest')
  if (typeof getManifestValue !== 'function') {
    return undefined
  }
  try {
    const manifest: unknown = Reflect.apply(getManifestValue, chromeRuntime, [])
    if (isObjectLike(manifest)) {
      const version: unknown = Reflect.get(manifest, 'version')
      return typeof version === 'string' ? version : undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * `chrome.runtime.getURL(path)` を安全に呼び出す。
 * `chrome` API が見つからない環境では `undefined` を返す。
 */
export const getExtensionUrl = (path: string): string | undefined => {
  const chromeRuntime = getGlobalChromeRuntime()
  if (!chromeRuntime) {
    return undefined
  }
  const getURLValue: unknown = Reflect.get(chromeRuntime, 'getURL')
  if (typeof getURLValue !== 'function') {
    return undefined
  }
  try {
    const url: unknown = Reflect.apply(getURLValue, chromeRuntime, [path])
    return typeof url === 'string' ? url : undefined
  } catch {
    return undefined
  }
}

export const sendRuntimeMessage = async (
  message: unknown,
): Promise<unknown> => {
  const browserApi = getGlobalBrowserApi()
  if (browserApi?.runtime?.sendMessage) {
    return browserApi.runtime.sendMessage(message)
  }

  // eslint-disable-next-line eslint/no-useless-assignment
  let polyfillBrowserApi: BrowserApi | null = null
  try {
    polyfillBrowserApi = await loadWebExtensionBrowserApi()
  } catch {
    polyfillBrowserApi = null
  }
  if (polyfillBrowserApi?.runtime?.sendMessage) {
    try {
      return await polyfillBrowserApi.runtime.sendMessage(message)
    } catch {
      // フォールバックとして chrome.runtime を試す
    }
  }

  const chromeRuntime = getGlobalChromeRuntime()
  if (!chromeRuntime?.sendMessage) {
    return undefined
  }
  return sendWithChromeRuntime(chromeRuntime, message)
}

// eslint-disable-next-line eslint/complexity
export const connectRuntimePort = async (
  name: string,
): Promise<RuntimePort | null> => {
  const browserApi = getGlobalBrowserApi()
  if (browserApi?.runtime?.connect) {
    return browserApi.runtime.connect({
      name,
    })
  }

  // eslint-disable-next-line eslint/no-useless-assignment
  let polyfillBrowserApi: BrowserApi | null = null
  try {
    polyfillBrowserApi = await loadWebExtensionBrowserApi()
  } catch {
    polyfillBrowserApi = null
  }

  if (polyfillBrowserApi?.runtime?.connect) {
    try {
      const port: unknown = polyfillBrowserApi.runtime.connect({
        name,
      })
      if (isRuntimePort(port)) {
        return port
      }
    } catch {
      // フォールバックとして chrome.runtime を試す
    }
  }

  const chromeRuntime = getGlobalChromeRuntime()
  if (!chromeRuntime?.connect) {
    return null
  }

  try {
    return chromeRuntime.connect({
      name,
    })
  } catch {
    return null
  }
}

interface BrowserRuntime {
  connect?: (connectInfo?: { name?: string }) => RuntimePort
  sendMessage?: (message: unknown) => Promise<unknown>
}

interface BrowserApi {
  runtime?: BrowserRuntime
}

interface ChromeRuntime {
  connect?: (connectInfo?: { name?: string }) => RuntimePort
  sendMessage?: (
    message: unknown,
    callback?: (response: unknown) => void,
  ) => void
}

interface RuntimePort {
  disconnect: () => void
  onDisconnect: {
    addListener: (listener: () => void) => void
  }
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void
  }
  postMessage: (message: unknown) => void
}

interface BrowserModule {
  default?: BrowserApi
}

let browserApiPromise: Promise<BrowserApi | null> | null = null

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

const hasFunctionProperty = (value: object, property: string): boolean =>
  typeof Reflect.get(value, property) === 'function'

const hasAddListener = (value: unknown): boolean =>
  isObject(value) && hasFunctionProperty(value, 'addListener')

const isRuntimePort = (value: unknown): value is RuntimePort =>
  isObject(value) &&
  hasFunctionProperty(value, 'disconnect') &&
  hasAddListener(Reflect.get(value, 'onDisconnect')) &&
  hasAddListener(Reflect.get(value, 'onMessage')) &&
  hasFunctionProperty(value, 'postMessage')

const getGlobalBrowserApi = (): BrowserApi | null => {
  const api: unknown = Reflect.get(globalThis, 'browser')
  return isObject(api) ? api : null
}

const getGlobalChromeRuntime = (): ChromeRuntime | null => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  if (typeof chromeValue !== 'object' || chromeValue === null) {
    return null
  }
  const runtimeValue: unknown = Reflect.get(chromeValue, 'runtime')
  if (typeof runtimeValue !== 'object' || runtimeValue === null) {
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

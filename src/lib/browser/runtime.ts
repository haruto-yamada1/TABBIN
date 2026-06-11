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

const getGlobalBrowserApi = (): BrowserApi | null => {
  const api = (globalThis as typeof globalThis & { browser?: BrowserApi })
    .browser
  return api ?? null
}

const getGlobalChromeRuntime = (): ChromeRuntime | null => {
  const runtime = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: ChromeRuntime }
    }
  ).chrome?.runtime
  return runtime ?? null
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
      const port = polyfillBrowserApi.runtime.connect({
        name,
      })
      if (port) {
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

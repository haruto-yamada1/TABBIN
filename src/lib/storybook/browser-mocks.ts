/* eslint-disable typescript/no-unsafe-call */
type StorageChangeListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0]

type StorybookStorageState = Record<string, unknown>

const storageState: StorybookStorageState = {}
const storageListeners = new Set<StorageChangeListener>()
const runtimeMessages: unknown[] = []

class StorybookMediaStreamTrack {
  kind = 'audio'

  stop() {
    return undefined
  }
}

class StorybookMediaStream {
  getTracks() {
    return [new StorybookMediaStreamTrack()]
  }
}

type MediaRecorderListener = (event?: Event | BlobEvent) => void

class StorybookMediaRecorder extends EventTarget {
  state: RecordingState = 'inactive'
  stream: MediaStream

  private readonly listeners = new Map<string, Set<MediaRecorderListener>>()

  constructor(stream: MediaStream) {
    super()
    this.stream = stream
  }

  addEventListener(type: string, listener: MediaRecorderListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: MediaRecorderListener) {
    this.listeners.get(type)?.delete(listener)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    const stopEvent = new Event('stop')
    for (const listener of this.listeners.get('stop') ?? []) {
      listener(stopEvent)
    }
  }
}

class StorybookSpeechRecognition extends EventTarget {
  continuous = false
  interimResults = false
  lang = 'en-US'
  onend: ((this: StorybookSpeechRecognition, ev: Event) => void) | null = null
  onerror: ((this: StorybookSpeechRecognition, ev: Event) => void) | null = null
  onresult: ((this: StorybookSpeechRecognition, ev: Event) => void) | null =
    null
  onstart: ((this: StorybookSpeechRecognition, ev: Event) => void) | null = null

  start() {
    const startEvent = new Event('start')
    this.dispatchEvent(startEvent)
    this.onstart?.call(this, startEvent)
  }

  stop() {
    const endEvent = new Event('end')
    this.dispatchEvent(endEvent)
    this.onend?.call(this, endEvent)
  }
}

const cloneValue = <T>(value: T): T => {
  if (value === undefined) {
    return value
  }

  return structuredClone(value)
}

const emitStorageChanges = (changes: StorybookStorageState) => {
  if (Object.keys(changes).length === 0) {
    return
  }

  const formattedChanges = Object.fromEntries(
    Object.entries(changes).map(([key, newValue]) => [
      key,
      {
        newValue: cloneValue(newValue),
        oldValue: undefined,
      },
    ]),
  ) as Record<string, chrome.storage.StorageChange>

  for (const listener of storageListeners) {
    listener(formattedChanges, 'local')
  }
}

const resolveRequestedKeys = (
  keys?: null | string | string[] | Record<string, unknown>,
): string[] | null => {
  if (keys === undefined || keys === null) {
    return null
  }

  if (typeof keys === 'string') {
    return [keys]
  }

  if (Array.isArray(keys)) {
    return keys
  }

  return Object.keys(keys)
}

const createRuntimePort = () => ({
  disconnect: () => undefined,
  onDisconnect: {
    addListener: () => undefined,
  },
  onMessage: {
    addListener: () => undefined,
  },
  postMessage: (message: unknown) => {
    runtimeMessages.push(message)
  },
})

const chromeMock = {
  runtime: {
    connect: () => createRuntimePort(),
    sendMessage: (...args: unknown[]) => {
      const [message, maybeCallback] = args
      runtimeMessages.push(message)
      if (typeof maybeCallback === 'function') {
        maybeCallback({
          ok: true,
        })
      }
    },
  },
  storage: {
    local: {
      clear: () => {
        for (const key of Object.keys(storageState)) {
          Reflect.deleteProperty(storageState, key)
        }
        return Promise.resolve()
      },
      get: (keys: null | string | string[] | Record<string, unknown>) => {
        const requestedKeys = resolveRequestedKeys(keys)

        if (!requestedKeys) {
          return Promise.resolve(cloneValue(storageState))
        }

        return Promise.resolve(
          Object.fromEntries(
            requestedKeys.reduce<[string, unknown][]>((items, key) => {
              if (key in storageState) {
                items.push([key, cloneValue(storageState[key])])
              }
              return items
            }, []),
          ),
        )
      },
      remove: (keys: null | string | string[] | Record<string, unknown>) => {
        const requestedKeys = resolveRequestedKeys(keys) ?? []

        for (const key of requestedKeys) {
          Reflect.deleteProperty(storageState, key)
        }
        return Promise.resolve()
      },
      set: (items: Record<string, unknown>) => {
        const changes: StorybookStorageState = {}

        for (const [key, value] of Object.entries(items)) {
          storageState[key] = cloneValue(value)
          changes[key] = value
        }

        emitStorageChanges(changes)
        return Promise.resolve()
      },
    },
    onChanged: {
      addListener: (listener: StorageChangeListener) => {
        storageListeners.add(listener)
      },
      hasListener: (listener: StorageChangeListener) =>
        storageListeners.has(listener),
      removeListener: (listener: StorageChangeListener) => {
        storageListeners.delete(listener)
      },
    },
    sync: {
      clear: () => undefined,
      get: () => ({}),
      remove: () => undefined,
      set: () => undefined,
    },
  },
}

const browserMock = {
  runtime: {
    connect: () => createRuntimePort(),
    sendMessage: (message: unknown) => {
      runtimeMessages.push(message)
      return {
        ok: true,
      }
    },
  },
}

const ensureNavigatorMocks = () => {
  if (typeof navigator === 'undefined') {
    return
  }

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.resolve(undefined),
      },
    })
  }

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        enumerateDevices: () =>
          Promise.resolve([
            {
              deviceId: 'mic-primary',
              groupId: 'group-primary',
              kind: 'audioinput',
              label: 'Built-in Microphone (1234:5678)',
              toJSON: () => ({}),
            } satisfies MediaDeviceInfo,
          ]),
        getUserMedia: () => Promise.resolve(new StorybookMediaStream()),
        removeEventListener: () => undefined,
      },
    })
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {
        return undefined
      }

      observe() {
        return undefined
      }

      unobserve() {
        return undefined
      }
    }
  }

  if (!globalThis.MediaRecorder) {
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: StorybookMediaRecorder,
      writable: true,
    })
  }

  if (
    !(
      'SpeechRecognition' in globalThis ||
      'webkitSpeechRecognition' in globalThis
    )
  ) {
    const globalWithSpeechRecognition = globalThis as typeof globalThis &
      Record<string, unknown>

    globalWithSpeechRecognition.SpeechRecognition = StorybookSpeechRecognition
    globalWithSpeechRecognition.webkitSpeechRecognition =
      StorybookSpeechRecognition
  }
}

export const createStorybookChromeMock = () => {
  Object.assign(globalThis, { chrome: chromeMock, browser: browserMock })
  ensureNavigatorMocks()

  return chromeMock
}

export const primeStorybookBrowserMocks = (
  nextState: StorybookStorageState = {},
) => {
  createStorybookChromeMock()

  for (const key of Object.keys(storageState)) {
    Reflect.deleteProperty(storageState, key)
  }

  for (const [key, value] of Object.entries(nextState)) {
    storageState[key] = cloneValue(value)
  }
}

export const setStorybookStorage = (nextState: StorybookStorageState) => {
  for (const [key, value] of Object.entries(nextState)) {
    storageState[key] = cloneValue(value)
  }
}

export const resetStorybookBrowserMocks = () => {
  for (const key of Object.keys(storageState)) {
    Reflect.deleteProperty(storageState, key)
  }
  runtimeMessages.length = 0
}

export const NATIVE_SAVED_TAB_TITLE_ACTION = 'tabbinNativeSavedTitle'

export type NativeSavedTabTitleResult = {
  baseTitle: string
  displayTitle: string
  url: string
}

/** Read-only ownership proof, serialized into the same isolated world. */
export const isCapturedTabTitleUnowned = (
  expectedUrl: string,
  expectedTitle: string,
): boolean =>
  window.top === window &&
  location.href === expectedUrl &&
  document.title === expectedTitle &&
  !Reflect.has(globalThis, '__tabbinNativeSavedTitle')

/** Runs in the tab's isolated world; keep all runtime dependencies inside it. */
export const applySavedTabTitle = (
  saved: boolean,
  expectedUrl: string,
): NativeSavedTabTitleResult | undefined => {
  if (window.top !== window || location.href !== expectedUrl) {
    return undefined
  }

  type TitleState = {
    baseTitle: string
    displayTitle: string
    removeListener: () => void
  }
  type MessageListener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response: NativeSavedTabTitleResult) => void,
  ) => void

  const stateKey = '__tabbinNativeSavedTitle'
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const isState = (value: unknown): value is TitleState =>
    isRecord(value) &&
    typeof value.baseTitle === 'string' &&
    typeof value.displayTitle === 'string' &&
    typeof value.removeListener === 'function'

  const read = (state: TitleState): NativeSavedTabTitleResult => ({
    baseTitle:
      document.title === state.displayTitle ? state.baseTitle : document.title,
    displayTitle: document.title,
    url: location.href,
  })
  const restore = (state: TitleState): NativeSavedTabTitleResult => {
    if (document.title === state.displayTitle) {
      document.title = state.baseTitle
    }
    state.removeListener()
    Reflect.deleteProperty(globalThis, stateKey)
    return {
      baseTitle: document.title,
      displayTitle: document.title,
      url: location.href,
    }
  }

  const previousState: unknown = Reflect.get(globalThis, stateKey)
  const state = isState(previousState) ? previousState : undefined
  if (!saved) {
    return state ? restore(state) : undefined
  }

  if (state) {
    if (document.title === state.displayTitle) {
      return read(state)
    }
    state.baseTitle = read(state).baseTitle
    state.displayTitle = `✓ ${state.baseTitle}`
    document.title = state.displayTitle
    state.displayTitle = document.title
    return read(state)
  }

  const getRuntime = () => {
    const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
    const runtime = isRecord(chromeValue) ? chromeValue.runtime : undefined
    const onMessage = isRecord(runtime) ? runtime.onMessage : undefined
    if (
      !isRecord(runtime) ||
      typeof runtime.id !== 'string' ||
      runtime.id.length === 0 ||
      !isRecord(onMessage)
    ) {
      return undefined
    }
    const { addListener, removeListener } = onMessage
    if (
      typeof addListener !== 'function' ||
      typeof removeListener !== 'function'
    ) {
      return undefined
    }
    return {
      id: runtime.id,
      addListener: (listener: MessageListener): void => {
        Reflect.apply(addListener, onMessage, [listener])
      },
      removeListener: (listener: MessageListener): void => {
        Reflect.apply(removeListener, onMessage, [listener])
      },
    }
  }
  const runtime = getRuntime()
  if (!runtime) {
    return undefined
  }

  const nextState: TitleState = {
    baseTitle: document.title,
    displayTitle: `✓ ${document.title}`,
    removeListener: () => {
      runtime.removeListener(listener)
    },
  }
  const listener: MessageListener = (message, sender, sendResponse) => {
    if (
      !isRecord(sender) ||
      sender.id !== runtime.id ||
      !isRecord(message) ||
      Reflect.ownKeys(message).length !== 2 ||
      !Object.hasOwn(message, 'action') ||
      !Object.hasOwn(message, 'command') ||
      message.action !== 'tabbinNativeSavedTitle' ||
      (message.command !== 'read' && message.command !== 'restore')
    ) {
      return
    }
    sendResponse(
      message.command === 'restore' ? restore(nextState) : read(nextState),
    )
  }
  runtime.addListener(listener)
  Reflect.set(globalThis, stateKey, nextState)
  document.title = nextState.displayTitle
  nextState.displayTitle = document.title
  return read(nextState)
}

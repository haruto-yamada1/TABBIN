import { SAVED_TAB_TITLE_ENABLED_KEY } from '@/constants/savedTabTitleIndicator'

import { isObjectLike } from './chrome-global'
import { isCapturedTabTitleUnowned } from './saved-tab-title'

export type NativeTitleCapture = {
  readonly id: number
  readonly url: string
  readonly title?: string | undefined
}

type ScriptingApi = {
  scripting: {
    executeScript: (details: {
      target: { tabId: number }
      func: typeof isCapturedTabTitleUnowned
      args: [string, string]
    }) => Promise<unknown>
  }
}
type HistoryApi = {
  storage: { local: { get: (keys: string[]) => Promise<unknown> } }
  permissions: { getAll: () => Promise<unknown> }
}

const isScriptingApi = (value: unknown): value is ScriptingApi => {
  const scripting: unknown = isObjectLike(value)
    ? Reflect.get(value, 'scripting')
    : undefined
  return (
    isObjectLike(scripting) &&
    typeof Reflect.get(scripting, 'executeScript') === 'function'
  )
}
const isHistoryApi = (value: unknown): value is HistoryApi => {
  if (!isObjectLike(value)) {
    return false
  }
  const storage: unknown = Reflect.get(value, 'storage')
  const local: unknown = isObjectLike(storage)
    ? Reflect.get(storage, 'local')
    : undefined
  const permissions: unknown = Reflect.get(value, 'permissions')
  return (
    isObjectLike(local) &&
    typeof Reflect.get(local, 'get') === 'function' &&
    isObjectLike(permissions) &&
    typeof Reflect.get(permissions, 'getAll') === 'function'
  )
}
const getApi = <T>(validate: (value: unknown) => value is T): T | undefined => {
  for (const name of ['browser', 'chrome']) {
    const api: unknown = Reflect.get(globalThis, name)
    if (validate(api)) {
      return api
    }
  }
  return undefined
}
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((entry: unknown) => typeof entry === 'string')

const proveNeverUsed = async (): Promise<boolean> => {
  const api = getApi(isHistoryApi)
  if (!api) {
    return false
  }
  try {
    const [settings, granted] = await Promise.all([
      api.storage.local.get([SAVED_TAB_TITLE_ENABLED_KEY]),
      api.permissions.getAll(),
    ])
    if (
      !isObjectLike(settings) ||
      Object.hasOwn(settings, SAVED_TAB_TITLE_ENABLED_KEY) ||
      !isObjectLike(granted)
    ) {
      return false
    }
    const permissions: unknown = Reflect.get(granted, 'permissions')
    const origins: unknown = Reflect.get(granted, 'origins')
    return (
      isStringArray(permissions) &&
      !permissions.includes('scripting') &&
      isStringArray(origins) &&
      !origins.some((origin) =>
        ['http://*/*', 'https://*/*', '<all_urls>'].includes(origin),
      )
    )
  } catch {
    return false
  }
}

/** A captured prefix is safe only with same-document proof or never-used state. */
export const proveCapturedTitleUnowned = async (
  tab: NativeTitleCapture,
): Promise<boolean> => {
  const api = getApi(isScriptingApi)
  if (api && typeof tab.title === 'string') {
    try {
      const results: unknown = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: isCapturedTabTitleUnowned,
        args: [tab.url, tab.title],
      })
      if (!Array.isArray(results) || results.length !== 1) {
        return false
      }
      const result: unknown = results[0]
      return (
        isObjectLike(result) &&
        Reflect.get(result, 'frameId') === 0 &&
        Reflect.get(result, 'result') === true
      )
    } catch {
      // Missing access or a closed document cannot prove ownership either way.
    }
  }
  return proveNeverUsed()
}

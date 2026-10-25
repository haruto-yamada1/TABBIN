import { isObjectLike } from './chrome-global'
import { proveCapturedTitleUnowned } from './prove-unmarked-tab-title'
import type { NativeSavedTabTitleResult } from './saved-tab-title'
import { NATIVE_SAVED_TAB_TITLE_ACTION } from './saved-tab-title'

type CapturedTitleTab = {
  readonly id?: number | undefined
  readonly url?: string | undefined
  readonly title?: string | undefined
  readonly incognito?: boolean | undefined
}

type TabMessagingApi = {
  sendMessage: (
    tabId: number,
    message: { action: string; command: 'read' },
    options: { frameId: number },
  ) => Promise<unknown>
}

const isTabMessagingApi = (value: unknown): value is TabMessagingApi =>
  isObjectLike(value) && typeof Reflect.get(value, 'sendMessage') === 'function'

const getTabMessagingApi = (): TabMessagingApi | undefined => {
  for (const name of ['browser', 'chrome']) {
    const api: unknown = Reflect.get(globalThis, name)
    if (!isObjectLike(api)) {
      continue
    }
    const tabs: unknown = Reflect.get(api, 'tabs')
    if (isTabMessagingApi(tabs)) {
      return tabs
    }
  }
  return undefined
}

const isEligibleTab = (
  tab: CapturedTitleTab,
): tab is CapturedTitleTab & { id: number; url: string } => {
  if (
    tab.incognito !== false ||
    typeof tab.id !== 'number' ||
    !Number.isSafeInteger(tab.id) ||
    tab.id < 0 ||
    typeof tab.url !== 'string'
  ) {
    return false
  }
  try {
    const url = new URL(tab.url)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const isTitleResult = (value: unknown): value is NativeSavedTabTitleResult => {
  const fields = ['baseTitle', 'displayTitle', 'url'] as const
  return (
    isObjectLike(value) &&
    Reflect.ownKeys(value).length === fields.length &&
    fields.every(
      (field) =>
        Object.hasOwn(value, field) &&
        typeof Reflect.get(value, field) === 'string',
    )
  )
}

export class NativeSavedTabTitleCaptureError extends Error {
  readonly code = 'NATIVE_SAVED_TAB_TITLE_CAPTURE_UNAVAILABLE'

  constructor() {
    super('Native saved-tab title could not be verified. Retry saving the tab.')
    this.name = 'NativeSavedTabTitleCaptureError'
  }
}

/** Read only titles owned by our injected listener; never infer from a prefix. */
export const normalizeSavedTabTitles = async <T extends CapturedTitleTab>(
  tabs: T[],
): Promise<T[]> => {
  const api = getTabMessagingApi()
  const normalized = await Promise.all(
    tabs.map(async (tab) => {
      if (!isEligibleTab(tab)) {
        return tab
      }
      let result: unknown
      try {
        result = await api?.sendMessage(
          tab.id,
          { action: NATIVE_SAVED_TAB_TITLE_ACTION, command: 'read' },
          { frameId: 0 },
        )
      } catch {
        // The captured title still needs ownership proof after a channel failure.
      }
      if (isTitleResult(result)) {
        if (result.url !== tab.url) {
          throw new NativeSavedTabTitleCaptureError()
        }
        return { ...tab, title: result.baseTitle }
      }
      const mayContainOwnedMark =
        tab.title === '✓' || tab.title?.startsWith('✓ ') === true
      if (
        mayContainOwnedMark &&
        !(await proveCapturedTitleUnowned(tab).catch(() => false))
      ) {
        throw new NativeSavedTabTitleCaptureError()
      }
      return tab
    }),
  )
  return normalized.every((tab, index) => tab === tabs[index])
    ? tabs
    : normalized
}

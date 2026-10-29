import type {
  BrowserOpenTab,
  BrowserOpenTabChange,
  BrowserOpenTabsSource,
} from '@/contexts/saved-tabs/application/ports/OpenSavedTabsPort'
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'

type BrowserTab = {
  readonly id?: number
  readonly url?: string | undefined
  readonly incognito?: boolean | undefined
}

type BrowserEvent<Listener> = {
  readonly addListener: (listener: Listener) => void
  readonly removeListener: (listener: Listener) => void
}

type BrowserOpenTabsApi = {
  readonly extension?: { readonly inIncognitoContext?: boolean }
  readonly tabs?: {
    readonly query?: (query: object) => Promise<readonly BrowserTab[]>
    readonly get?: (id: number) => Promise<BrowserTab>
    readonly onCreated?: BrowserEvent<(tab: BrowserTab) => void>
    readonly onUpdated?: BrowserEvent<
      (
        id: number,
        change: { readonly url?: string | undefined },
        tab: BrowserTab,
      ) => void
    >
    readonly onRemoved?: BrowserEvent<(id: number) => void>
    readonly onReplaced?: BrowserEvent<
      (addedId: number, removedId: number) => void
    >
  }
}

const isOpenTabsApi = (value: unknown): value is BrowserOpenTabsApi =>
  isObjectLike(value)

const getBrowserApi = (): BrowserOpenTabsApi | undefined => {
  const browserValue: unknown = Reflect.get(globalThis, 'browser')
  if (browserValue !== undefined) {
    return isOpenTabsApi(browserValue) ? browserValue : undefined
  }
  return getChromeGlobal(isOpenTabsApi)
}

const isTabId = (id: number | undefined): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id >= 0

const toNormalTab = (tab: BrowserTab): BrowserOpenTab | undefined => {
  if (tab.incognito !== false || !isTabId(tab.id)) {
    return undefined
  }
  return {
    id: tab.id,
    ...(typeof tab.url === 'string' && tab.url.length > 0
      ? { url: tab.url }
      : {}),
  }
}

/** Read-only browser observation. Private/inaccessible URL data stops here. */
export const createChromeOpenTabsAdapter = (
  deps: { readonly getApi?: () => BrowserOpenTabsApi | undefined } = {},
): BrowserOpenTabsSource => {
  const getApi = deps.getApi ?? getBrowserApi
  return {
    query: async () => {
      const api = getApi()
      if (api?.extension?.inIncognitoContext === true) {
        return []
      }
      const tabs = api?.tabs
      if (!tabs?.query) {
        throw new Error('Browser tab observation unavailable')
      }
      const snapshot = await tabs.query({})
      return snapshot.flatMap((tab) => {
        const normal = toNormalTab(tab)
        return normal ? [normal] : []
      })
    },
    subscribe: (listener) => {
      const api = getApi()
      if (api?.extension?.inIncognitoContext === true) {
        return () => {}
      }
      const tabs = api?.tabs
      if (
        !tabs?.onCreated ||
        !tabs.onUpdated ||
        !tabs.onRemoved ||
        !tabs.onReplaced ||
        !tabs.get
      ) {
        throw new Error('Browser tab observation unavailable')
      }
      let active = true
      const pendingReads = new Map<number, symbol>()
      const emit = (change: BrowserOpenTabChange) => {
        if (active) {
          listener(change)
        }
      }
      const upsert = (tab: BrowserTab) => {
        if (!isTabId(tab.id)) {
          return
        }
        pendingReads.delete(tab.id)
        const normal = toNormalTab(tab)
        emit(
          normal
            ? { type: 'upsert', tab: normal }
            : { type: 'remove', tabId: tab.id },
        )
      }
      const remove = (id: number) => {
        if (!isTabId(id)) {
          return
        }
        pendingReads.delete(id)
        emit({ type: 'remove', tabId: id })
      }
      const update = (
        id: number,
        change: { readonly url?: string | undefined },
        tab: BrowserTab,
      ) => {
        if (!Object.hasOwn(change, 'url')) {
          return
        }
        upsert({ id, url: change.url, incognito: tab.incognito })
      }
      const replace = (addedId: number, removedId: number) => {
        remove(removedId)
        if (!isTabId(addedId)) {
          return
        }
        const token = Symbol('replacement-read')
        pendingReads.set(addedId, token)
        const isCurrent = () => active && pendingReads.get(addedId) === token
        // A replacement can disappear or navigate before get completes.
        void (async () => {
          try {
            const tab = await tabs.get?.(addedId)
            if (!isCurrent()) {
              return
            }
            if (!tab || tab.id !== addedId) {
              remove(addedId)
              return
            }
            upsert(tab)
          } catch {
            if (isCurrent()) {
              remove(addedId)
            }
          }
        })()
      }
      const cleanups: (() => void)[] = []
      const listen = <Listener>(
        event: BrowserEvent<Listener>,
        callback: Listener,
      ) => {
        event.addListener(callback)
        cleanups.push(() => {
          event.removeListener(callback)
        })
      }
      const unsubscribe = () => {
        active = false
        pendingReads.clear()
        for (const cleanup of cleanups) {
          cleanup()
        }
      }
      try {
        listen(tabs.onCreated, upsert)
        listen(tabs.onUpdated, update)
        listen(tabs.onRemoved, remove)
        listen(tabs.onReplaced, replace)
      } catch (error) {
        unsubscribe()
        throw error
      }
      return unsubscribe
    },
  }
}

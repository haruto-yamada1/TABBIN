import type {
  BrowserOpenTab,
  BrowserOpenTabChange,
  BrowserOpenTabsSource,
  OpenSavedTabsPort,
} from '@/contexts/saved-tabs/application/ports/OpenSavedTabsPort'
import { createUrlIdentityKey } from '@/contexts/saved-tabs/domain/services/UrlIdentityPolicy'

/** One observation per mounted page, with notifications scoped to changed URLs. */
export const createOpenSavedTabsService = (
  source: BrowserOpenTabsSource,
): OpenSavedTabsPort => {
  const tabs = new Map<number, string>()
  const counts = new Map<string, number>()
  const listeners = new Map<string, Set<() => void>>()
  let subscriberCount = 0
  let generation = 0
  let stopSource: (() => void) | undefined

  const notify = (url: string) => {
    for (const listener of listeners.get(url) ?? []) {
      listener()
    }
  }
  const changeCount = (url: string, delta: number, publish: boolean) => {
    const before = counts.get(url) ?? 0
    const after = before + delta
    if (after > 0) {
      counts.set(url, after)
    } else {
      counts.delete(url)
    }
    if (publish && before > 0 !== after > 0) {
      notify(url)
    }
  }
  const apply = (change: BrowserOpenTabChange, publish: boolean) => {
    const id = change.type === 'remove' ? change.tabId : change.tab.id
    const before = tabs.get(id)
    let after: string | undefined
    if (change.type === 'upsert' && change.tab.url !== undefined) {
      try {
        after = createUrlIdentityKey(change.tab.url)
      } catch {
        // An inaccessible or invalid URL cannot establish an exact match.
      }
    }
    if (before === after) {
      return
    }
    if (before !== undefined) {
      tabs.delete(id)
      changeCount(before, -1, publish)
    }
    if (after !== undefined) {
      tabs.set(id, after)
      changeCount(after, 1, publish)
    }
  }
  const start = () => {
    const currentGeneration = ++generation
    // Keep only the final observation for each tab while the initial query waits.
    let pending: Map<number, BrowserOpenTabChange> | undefined = new Map()
    try {
      stopSource = source.subscribe((change) => {
        if (generation !== currentGeneration) {
          return
        }
        if (pending) {
          const id = change.type === 'remove' ? change.tabId : change.tab.id
          pending.set(id, change)
        } else {
          apply(change, true)
        }
      })
    } catch {
      return
    }
    void (async () => {
      let initial: readonly BrowserOpenTab[]
      try {
        initial = await source.query()
      } catch {
        // Optional browser observation must not block saved URL operations.
        initial = []
      }
      if (generation !== currentGeneration) {
        return
      }
      for (const tab of initial) {
        apply({ type: 'upsert', tab }, false)
      }
      for (const change of pending.values()) {
        apply(change, false)
      }
      pending = undefined
      for (const url of counts.keys()) {
        notify(url)
      }
    })()
  }

  return {
    getSnapshot: (url) => counts.has(url),
    subscribe: (url, listener) => {
      // Each subscription owns a registration even if callbacks are reused.
      const registration = () => {
        listener()
      }
      let urlListeners = listeners.get(url)
      if (!urlListeners) {
        urlListeners = new Set()
        listeners.set(url, urlListeners)
      }
      urlListeners.add(registration)
      subscriberCount += 1
      if (subscriberCount === 1) {
        start()
      }
      let active = true
      return () => {
        if (!active) {
          return
        }
        active = false
        urlListeners.delete(registration)
        if (urlListeners.size === 0) {
          listeners.delete(url)
        }
        subscriberCount -= 1
        if (subscriberCount === 0) {
          generation += 1
          stopSource?.()
          stopSource = undefined
          tabs.clear()
          counts.clear()
        }
      }
    },
  }
}

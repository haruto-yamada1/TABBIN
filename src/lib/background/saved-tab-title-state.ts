export type NativeTitleTab = {
  readonly id?: number | undefined
  readonly url?: string | undefined
  readonly title?: string | undefined
  readonly incognito?: boolean | undefined
}
export type NativeTitleStateDeps = {
  readonly readEnabled: () => Promise<boolean>
  readonly readSavedUrls: () => Promise<ReadonlySet<string>>
  readonly queryTabs: () => Promise<readonly NativeTitleTab[]>
  readonly apply: (id: number, url: string) => Promise<void>
  readonly restore: (id: number) => Promise<void>
}

const isEligibleTab = (
  tab: NativeTitleTab,
): tab is NativeTitleTab & { id: number; url: string } =>
  tab.incognito === false &&
  typeof tab.id === 'number' &&
  Number.isInteger(tab.id) &&
  tab.id >= 0 &&
  typeof tab.url === 'string' &&
  /^https?:\/\//u.test(tab.url)

/** Disposable worker-local projection, re-read on startup and persisted changes. */
export const createSavedTabTitleState = (deps: NativeTitleStateDeps) => {
  let enabled = false
  let savedUrls: ReadonlySet<string> = new Set()
  let requested = 0
  let pending = false
  let refreshing: Promise<void> | undefined
  const writes = new Map<number, Promise<void>>()
  const tokens = new Map<number, symbol>()

  const updateNow = async (tab: NativeTitleTab): Promise<void> => {
    if (!isEligibleTab(tab)) {
      return
    }
    const token = Symbol('tab-title-write')
    tokens.set(tab.id, token)
    const previous = writes.get(tab.id) ?? Promise.resolve()
    const operation = previous.then(async () => {
      if (tokens.get(tab.id) !== token) {
        return
      }
      try {
        if (enabled && savedUrls.has(tab.url)) {
          await deps.apply(tab.id, tab.url)
        } else {
          // Sending restore only reaches our own earlier injected listener.
          await deps.restore(tab.id)
        }
      } catch {
        // Closed tabs, restricted pages and revoked access are optional UI failures.
      }
    })
    writes.set(tab.id, operation)
    await operation
    if (writes.get(tab.id) === operation) {
      writes.delete(tab.id)
      tokens.delete(tab.id)
    }
  }

  const refresh = async (): Promise<void> => {
    requested += 1
    pending = true
    if (refreshing) {
      return refreshing
    }
    refreshing = (async () => {
      while (pending) {
        pending = false
        const current = requested
        let nextEnabled: boolean
        let nextUrls: ReadonlySet<string> = new Set()
        try {
          // eslint-disable-next-line eslint/no-await-in-loop -- finish this revision before re-reading
          nextEnabled = await deps.readEnabled()
          if (nextEnabled) {
            // eslint-disable-next-line eslint/no-await-in-loop -- read only after opt-in is confirmed
            nextUrls = await deps.readSavedUrls()
          }
        } catch {
          nextEnabled = false
        }
        if (current !== requested) {
          continue
        }
        enabled = nextEnabled
        savedUrls = nextUrls
        try {
          // eslint-disable-next-line eslint/no-await-in-loop -- query after the matching projection read
          const tabs = await deps.queryTabs()
          if (current === requested) {
            // eslint-disable-next-line eslint/no-await-in-loop -- finish writes before the next coalesced revision
            await Promise.all(tabs.map(updateNow))
          }
        } catch {
          enabled = false
          savedUrls = new Set()
        }
      }
    })().finally(() => {
      refreshing = undefined
    })
    return refreshing
  }

  return {
    refresh,
    update: async (tab: NativeTitleTab) => {
      await refreshing
      await updateNow(tab)
    },
    removed: (id: number) => {
      tokens.delete(id)
    },
  }
}

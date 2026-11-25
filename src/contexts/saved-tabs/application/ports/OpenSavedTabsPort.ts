/** Ephemeral, URL-scoped browser observations; never persisted with saved data. */
export type OpenSavedTabsPort = {
  readonly getSnapshot: (url: string) => boolean
  readonly subscribe: (url: string, listener: () => void) => () => void
  /**
   * Stable snapshot of every currently-open exact URL identity. The returned
   * reference only changes when a URL enters or leaves the open set, so
   * `useSyncExternalStore` can treat it as a scalar observation.
   */
  readonly getOpenUrlsSnapshot: () => readonly string[]
  /**
   * Fires whenever `getOpenUrlsSnapshot()` content changes. Shares the same
   * observation lifecycle as `subscribe()`.
   */
  readonly subscribeOpenUrls: (listener: () => void) => () => void
}

export type BrowserOpenTab = {
  readonly id: number
  readonly url?: string
}

export type BrowserOpenTabChange =
  | { readonly type: 'upsert'; readonly tab: BrowserOpenTab }
  | { readonly type: 'remove'; readonly tabId: number }

/** Infrastructure excludes private tabs and inaccessible URLs before this boundary. */
export type BrowserOpenTabsSource = {
  readonly query: () => Promise<readonly BrowserOpenTab[]>
  readonly subscribe: (
    listener: (change: BrowserOpenTabChange) => void,
  ) => () => void
}

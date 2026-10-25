/** Ephemeral, URL-scoped browser observations; never persisted with saved data. */
export type OpenSavedTabsPort = {
  readonly getSnapshot: (url: string) => boolean
  readonly subscribe: (url: string, listener: () => void) => () => void
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

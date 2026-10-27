export type SavedTabsSearchHistoryPort = {
  read: () => Promise<string[]>
  record: (query: string) => Promise<string[]>
  schedule: (query: string, signal: AbortSignal) => Promise<string[]>
  remove: (query: string) => Promise<string[]>
  subscribe: (listener: (removed: readonly string[]) => void) => () => void
}

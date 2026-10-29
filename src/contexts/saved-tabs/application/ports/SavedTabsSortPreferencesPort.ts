export type SortOrder = 'default' | 'asc' | 'desc'

export type SortScope = 'category' | 'domain' | 'project'

/** Device-local display order; domain ordering and Backup V2 stay unchanged. */
export type SavedTabsSortPreferencesPort = {
  read: (scope: SortScope, id: string) => Promise<SortOrder>
  write: (scope: SortScope, id: string, order: SortOrder) => Promise<void>
  subscribe: (
    scope: SortScope,
    id: string,
    listener: (order: SortOrder) => void,
  ) => () => void
}

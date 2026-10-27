export {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  SAVED_SEARCHES_MAX_COUNT,
} from '@/constants/savedSearches'

export type SavedSearch = { id: string; name: string; query: string }

export type SavedSearchesPort = {
  list: () => Promise<SavedSearch[]>
  save: (name: string, query: string) => Promise<SavedSearch[]>
  rename: (id: string, name: string) => Promise<SavedSearch[]>
  remove: (id: string) => Promise<SavedSearch[]>
  subscribe: (listener: () => void) => () => void
}

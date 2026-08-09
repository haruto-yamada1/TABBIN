import type { PersistenceChangePort } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type {
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'

const SAVED_TABS_SCOPES = new Set([
  'categories',
  'collections',
  'groups',
  'memberships',
  'urls',
])

export const createPersistenceChangeStorageAdapter = (
  changePort: PersistenceChangePort,
): StorageChangePort => ({
  subscribe: (listener) =>
    changePort.subscribe((event) => {
      if (!event.scopes.some((scope) => SAVED_TABS_SCOPES.has(scope))) {
        return
      }
      const change: TypedSavedTabsStorageChange = {
        key: 'urls',
        kind: 'noPayload',
        newValue: { revision: event.revision, scopes: [...event.scopes] },
        oldValue: undefined,
      }
      listener([change])
    }),
})

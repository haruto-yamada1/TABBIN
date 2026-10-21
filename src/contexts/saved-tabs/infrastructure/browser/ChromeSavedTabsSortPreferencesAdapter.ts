import type {
  SavedTabsSortPreferencesPort,
  SortOrder,
  SortScope,
} from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageLocal as getBrowserStorageLocal,
  getChromeStorageOnChanged,
} from '@/lib/browser/chrome-storage'

type SortPreferencesStorage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (value: Record<string, unknown>) => Promise<void>
}

type SortPreferencesChanges = {
  addListener: (listener: ChromeOnChangedListener) => void
  removeListener: (listener: ChromeOnChangedListener) => void
}

type ChromeSavedTabsSortPreferencesDeps = {
  readonly getStorageLocal?: () => SortPreferencesStorage | null
  readonly getOnChanged?: () => SortPreferencesChanges | null
}

const isSortOrder = (value: unknown): value is SortOrder =>
  value === 'default' || value === 'asc' || value === 'desc'

const parseSortOrder = (value: unknown): SortOrder =>
  isSortOrder(value) ? value : 'default'

const getSortPreferenceKey = (scope: SortScope, id: string): string =>
  `savedTabsSort:${scope}:${encodeURIComponent(id)}`

export const createChromeSavedTabsSortPreferences = (
  deps: ChromeSavedTabsSortPreferencesDeps = {},
): SavedTabsSortPreferencesPort => {
  const getOnChanged = deps.getOnChanged ?? getChromeStorageOnChanged
  const getChromeStorageLocal = (): SortPreferencesStorage => {
    const storage = (deps.getStorageLocal ?? getBrowserStorageLocal)()
    if (!storage) {
      throw new Error('Chrome storage local is unavailable')
    }
    return storage
  }

  return {
    read: async (scope, id) => {
      const key = getSortPreferenceKey(scope, id)
      const stored = await getChromeStorageLocal().get(key)
      return parseSortOrder(stored[key])
    },
    write: async (scope, id, order) => {
      if (!isSortOrder(order)) {
        throw new TypeError('Invalid saved-tabs sort preference')
      }
      await getChromeStorageLocal().set({
        [getSortPreferenceKey(scope, id)]: order,
      })
    },
    subscribe: (scope, id, listener) => {
      const key = getSortPreferenceKey(scope, id)
      const changes = getOnChanged()
      if (!changes) {
        throw new Error('Chrome storage change events are unavailable')
      }
      const onChanged: ChromeOnChangedListener = (changed, area) => {
        if (area !== 'local' || !Object.hasOwn(changed, key)) {
          return
        }
        listener(parseSortOrder(changed[key]?.newValue))
      }
      changes.addListener(onChanged)
      return () => {
        changes.removeListener(onChanged)
      }
    },
  }
}

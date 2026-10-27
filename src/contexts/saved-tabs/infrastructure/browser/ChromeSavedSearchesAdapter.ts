import type {
  SavedSearch,
  SavedSearchesPort,
} from '@/contexts/saved-tabs/application/ports/SavedSearchesPort'
import {
  getChromeStorageLocal,
  getChromeStorageOnChanged,
} from '@/lib/browser/chrome-storage'
import { defaultSettings } from '@/lib/storage/settings'
import { withUserSettingsLock } from '@/lib/storage/userSettingsLock'
import {
  savedSearchesSchema,
  savedSearchSchema,
} from '@/lib/storage/zod-storage'

type Storage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (value: Record<string, unknown>) => Promise<void>
}

type AdapterDeps = {
  storage?: Storage
  runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>
  createId?: () => string
}

export const createChromeSavedSearchesAdapter = (
  deps: AdapterDeps = {},
): SavedSearchesPort => {
  const getStorage = (): Storage => {
    const storage = deps.storage ?? getChromeStorageLocal()
    if (!storage) {
      throw new Error('User settings storage is unavailable')
    }
    return storage
  }
  const runExclusive = deps.runExclusive ?? withUserSettingsLock
  const read = async () => {
    const value = (await getStorage().get('userSettings')).userSettings
    if (
      value !== undefined &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      throw new Error('User settings are invalid')
    }
    const settings = {
      ...defaultSettings,
      ...(value === undefined ? {} : Object.fromEntries(Object.entries(value))),
    }
    const searches =
      settings.savedSearches === undefined
        ? []
        : savedSearchesSchema.parse(settings.savedSearches)
    return { settings, searches }
  }
  const mutate = async (
    update: (searches: SavedSearch[]) => SavedSearch[],
  ): Promise<SavedSearch[]> =>
    runExclusive(async () => {
      const { settings, searches } = await read()
      const next = savedSearchesSchema.parse(update(searches))
      await getStorage().set({
        userSettings: { ...settings, savedSearches: next },
      })
      return next
    })
  return {
    list: async () => (await read()).searches,
    save: async (name, query) =>
      mutate((searches) => [
        ...searches,
        savedSearchSchema.parse({
          id: (deps.createId ?? (() => crypto.randomUUID()))(),
          name: name.trim(),
          query,
        }),
      ]),
    rename: async (id, name) =>
      mutate((searches) => {
        if (!searches.some((search) => search.id === id)) {
          throw new Error('Saved search does not exist')
        }
        return searches.map((search) =>
          search.id === id ? { ...search, name: name.trim() } : search,
        )
      }),
    remove: async (id) =>
      mutate((searches) => {
        if (!searches.some((search) => search.id === id)) {
          throw new Error('Saved search does not exist')
        }
        return searches.filter((search) => search.id !== id)
      }),
    subscribe: (listener) => {
      const changes = getChromeStorageOnChanged()
      if (!changes) {
        throw new Error('User settings change events are unavailable')
      }
      const onChanged = (changed: Record<string, unknown>, area: string) => {
        if (area === 'local' && Object.hasOwn(changed, 'userSettings')) {
          listener()
        }
      }
      changes.addListener(onChanged)
      return () => {
        changes.removeListener(onChanged)
      }
    },
  }
}

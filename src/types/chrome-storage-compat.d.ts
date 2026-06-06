/// <reference types="chrome" />

type ThemePreference = 'dark' | 'light' | 'system' | 'user'

interface LocalStorageSchema {
  savedTabs: import('./storage').TabGroup[]
  parentCategories: import('./storage').ParentCategory[]
  customProjects: import('./storage').CustomProject[]
  customProjectOrder: string[]
  urls: import('./storage').UrlRecord[]
  userSettings: import('./storage').UserSettings
  domainCategorySettings: import('./storage').DomainCategorySettings[]
  domainCategoryMappings: import('./storage').DomainParentCategoryMapping[]
  urlsMigrationCompleted: boolean
  'tab-manager-theme': ThemePreference
  seenVersion: string
  changelogShown: boolean
}

type StorageSubset<K extends keyof LocalStorageSchema> = {
  [P in K]?: LocalStorageSchema[P]
}

type KnownStorageKey = keyof LocalStorageSchema

declare let chrome: Window['chrome']

declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(): Promise<Partial<LocalStorageSchema> & Record<string, unknown>>
      get(
        keys?: null,
      ): Promise<Partial<LocalStorageSchema> & Record<string, unknown>>
      get<K extends KnownStorageKey>(
        key: K,
      ): Promise<Pick<LocalStorageSchema, K>>
      get<K extends KnownStorageKey>(
        keys: readonly K[] | K[],
      ): Promise<Pick<LocalStorageSchema, K>>
      get<K extends KnownStorageKey>(
        keys: StorageSubset<K>,
      ): Promise<StorageSubset<K>>
      get<K extends string>(
        key: Exclude<K, KnownStorageKey>,
      ): Promise<Record<K, unknown>>
      get<K extends string>(
        keys:
          | readonly Exclude<K, KnownStorageKey>[]
          | Exclude<K, KnownStorageKey>[],
      ): Promise<Partial<Record<K, unknown>>>
      get(keys: Record<string, unknown>): Promise<Record<string, unknown>>
      get(
        callback: (
          items: Partial<LocalStorageSchema> & Record<string, unknown>,
        ) => void,
      ): void
      get<K extends KnownStorageKey>(
        key: K,
        callback: (items: Pick<LocalStorageSchema, K>) => void,
      ): void
      get<K extends KnownStorageKey>(
        keys: readonly K[] | K[],
        callback: (items: Pick<LocalStorageSchema, K>) => void,
      ): void
      get<K extends KnownStorageKey>(
        keys: StorageSubset<K>,
        callback: (items: StorageSubset<K>) => void,
      ): void
      get<K extends string>(
        key: Exclude<K, KnownStorageKey>,
        callback: (items: Record<K, unknown>) => void,
      ): void
      get<K extends string>(
        keys:
          | readonly Exclude<K, KnownStorageKey>[]
          | Exclude<K, KnownStorageKey>[],
        callback: (items: Partial<Record<K, unknown>>) => void,
      ): void
      get(
        keys: Record<string, unknown>,
        callback: (items: Record<string, unknown>) => void,
      ): void
    }
  }
}

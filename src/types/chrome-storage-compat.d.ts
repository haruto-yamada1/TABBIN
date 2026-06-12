/// <reference types="chrome" />

type ThemePreference = 'dark' | 'light' | 'system' | 'user'

interface LocalStorageSchema {
  // eslint-disable-next-line typescript/consistent-type-imports
  savedTabs: import('./storage').TabGroup[]
  // eslint-disable-next-line typescript/consistent-type-imports
  parentCategories: import('./storage').ParentCategory[]
  // eslint-disable-next-line typescript/consistent-type-imports
  customProjects: import('./storage').CustomProject[]
  customProjectOrder: string[]
  // eslint-disable-next-line typescript/consistent-type-imports
  urls: import('./storage').UrlRecord[]
  // eslint-disable-next-line typescript/consistent-type-imports
  userSettings: import('./storage').UserSettings
  // eslint-disable-next-line typescript/consistent-type-imports
  domainCategorySettings: import('./storage').DomainCategorySettings[]
  // eslint-disable-next-line typescript/consistent-type-imports
  domainCategoryMappings: import('./storage').DomainParentCategoryMapping[]
  urlsMigrationCompleted: boolean
  'tab-manager-theme': ThemePreference
  seenVersion: string
  changelogShown: boolean
}

type StorageSubset<K extends keyof LocalStorageSchema> = {
  [P in K]?: LocalStorageSchema[P]
}

/* eslint-disable eslint/no-redeclare */
type KnownStorageKey = keyof LocalStorageSchema

declare namespace chrome {
  namespace storage {
    interface StorageArea {
      // eslint-disable-next-line typescript/method-signature-style
      get(): Promise<Partial<LocalStorageSchema> & Record<string, unknown>>
      // eslint-disable-next-line typescript/method-signature-style
      get(
        // eslint-disable-next-line typescript/unified-signatures
        keys?: null,
      ): Promise<Partial<LocalStorageSchema> & Record<string, unknown>>
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        key: K,
      ): Promise<Pick<LocalStorageSchema, K>>
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        // eslint-disable-next-line typescript/unified-signatures
        keys: readonly K[] | K[],
      ): Promise<Pick<LocalStorageSchema, K>>
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        keys: StorageSubset<K>,
      ): Promise<StorageSubset<K>>
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends string>(
        key: Exclude<K, KnownStorageKey>,
      ): Promise<Record<K, unknown>>
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends string>(
        keys:
          | readonly Exclude<K, KnownStorageKey>[]
          | Exclude<K, KnownStorageKey>[],
      ): Promise<Partial<Record<K, unknown>>>
      // eslint-disable-next-line typescript/method-signature-style
      get(keys: Record<string, unknown>): Promise<Record<string, unknown>>
      // eslint-disable-next-line typescript/method-signature-style
      get(
        callback: (
          items: Partial<LocalStorageSchema> & Record<string, unknown>,
        ) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        key: K,
        callback: (items: Pick<LocalStorageSchema, K>) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        // eslint-disable-next-line typescript/unified-signatures
        keys: readonly K[] | K[],
        callback: (items: Pick<LocalStorageSchema, K>) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends KnownStorageKey>(
        keys: StorageSubset<K>,
        callback: (items: StorageSubset<K>) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends string>(
        key: Exclude<K, KnownStorageKey>,
        callback: (items: Record<K, unknown>) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get<K extends string>(
        keys:
          | readonly Exclude<K, KnownStorageKey>[]
          | Exclude<K, KnownStorageKey>[],
        callback: (items: Partial<Record<K, unknown>>) => void,
      ): void
      // eslint-disable-next-line typescript/method-signature-style
      get(
        keys: Record<string, unknown>,
        callback: (items: Record<string, unknown>) => void,
      ): void
    }
  }
}

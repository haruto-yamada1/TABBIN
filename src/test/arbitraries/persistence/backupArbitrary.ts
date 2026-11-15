import type { UserSettings } from '@/types/storage'

/**
 * Canonical valid user settings shared by Backup V2 round-trip tests.
 */
export const canonicalUserSettings = {
  clickBehavior: 'saveCurrentTab',
  confirmDeleteAll: true,
  confirmDeleteEach: true,
  enableCategories: true,
  excludePatterns: ['z.example', 'a.example'],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: false,
  protectFavoriteFromAutoRemoval: true,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showRelativeSavedTime: false,
  showSavedTime: true,
} as const satisfies UserSettings

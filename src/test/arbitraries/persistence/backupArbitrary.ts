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
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
} as const satisfies UserSettings

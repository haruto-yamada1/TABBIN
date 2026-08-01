import * as fc from 'fast-check'

import type { UserSettings } from '@/types/storage'

import { wellFormedLegacyStorageArbitrary } from './legacyStorageSnapshotArbitrary'
import { timestampArbitrary } from './primitives'

/**
 * Canonical valid user settings shared by the backup round-trip and the
 * legacy backup conversion property tests.
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

/**
 * Well-formed pre-IndexedDB backup envelope (Backup V0). Scoped to the
 * temporary compatibility window ending 2026-08-31; the property test
 * using this arbitrary is a #734 cleanup target.
 */
export const legacyBackupV0Arbitrary = fc
  .tuple(wellFormedLegacyStorageArbitrary, timestampArbitrary)
  .map(([storage, exportedAt]) => ({
    backup: {
      customProjectOrder: storage.customProjectOrder,
      customProjects: storage.customProjects,
      parentCategories: storage.parentCategories,
      savedTabs: storage.savedTabs,
      timestamp: new Date(exportedAt).toISOString(),
      urls: storage.urls,
      userSettings: canonicalUserSettings,
      version: '0.0.0-property-test',
    },
    importDate: '2026-08-01',
  }))

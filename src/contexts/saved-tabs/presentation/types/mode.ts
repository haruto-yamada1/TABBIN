import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UserSettings,
  ViewMode,
} from '@/types/storage'

export type ModeSyncEventType =
  | 'savedTabsUpdated'
  | 'customProjectsUpdated'
  | 'urlsUpdated'
  | 'settingsUpdated'
  | 'categoriesUpdated'

export interface ModeSyncEvent {
  type: ModeSyncEventType
}

export interface SavedTabsModeAdapter {
  readonly mode: ViewMode
  getGroups: () => Promise<TabGroup[]>
  getProjects: () => Promise<CustomProject[]>
  applySettings: (settings: Partial<UserSettings>) => void
  applyCategories: (categories: ParentCategory[]) => void
}

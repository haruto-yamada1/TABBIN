import type {
  SavedTabsUserSettingsDto as UserSettingsDto,
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

export type ViewMode = 'domain' | 'custom'

export type ModeSyncEventType =
  | 'savedTabsUpdated'
  | 'customProjectsUpdated'
  | 'urlsUpdated'
  | 'settingsUpdated'
  | 'categoriesUpdated'

export type ModeSyncEvent = {
  type: ModeSyncEventType
}

export type SavedTabsModeAdapter = {
  readonly mode: ViewMode
  getGroups: () => Promise<TabGroup[]>
  getProjects: () => Promise<CustomProject[]>
  applySettings: (settings: Partial<UserSettingsDto>) => void
  applyCategories: (categories: ParentCategory[]) => void
}
